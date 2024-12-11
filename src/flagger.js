const { ethers } = require('ethers');
const { formatEther, parseEther } = require('ethers/lib/utils');

const {
    rpcprovider,
    graph_endpoint,
    account,
    createContracts,
    restart_timeout,
    minimum_debt,
} = require('./utils');

// Fetch holders using `graphql-request`
async function fetchPotentialHolders() {
    const { request, gql } = await import('graphql-request'); // Dynamic import of ES module

    let allHolders = [];
    let skip = 0;
    const pageSize = 100;



    while (true) {
        const query1 = gql`
            query($skip: Int!) {
                activeStakers(where: { debtBalanceOf_gt: "0" }, skip: $skip) {
                # activeStakers(where: { debtBalanceOf_gt: "0" }, skip: $skip, first: ${pageSize}) {
                    id
                    collateral
                    debtBalanceOf
                }
            }
        `;
        const query2 = gql`
            query($skip: Int!) {
                snxholders(
                first: ${pageSize},
                skip: $skip,
                orderBy: collateral,
                orderDirection: desc,
                where: {
                    debtshares_gt: 0,
                }
                ) {
                id
                balanceOf
                block
                claims
                collateral
                debtEntryAtIndex
                debtshares
                initialDebtOwnership
                mints
                timestamp
                transferable
                }
          }
        `;

        const variables = { skip };
        try {
            const data = await request(graph_endpoint, query1, variables);
            const results = data.activeStakers.map(({ id, debtBalanceOf }) => ({
                // const results = data.snxholders.map(({ id }) => ({
                address: id,
                subgraph_debtBalanceOf: debtBalanceOf,
                formatted_contract_debtBalanceOf: 0,
                contract_debtBalanceOf: 0,
                cratio: 0,
                formattedCratio: 0,
                liquidationDeadline: 555 // any random non-zero
            }));

            allHolders = allHolders.concat(results);
            if (results.length < pageSize) break; // No more results
            skip += pageSize;
        } catch (err) {
            console.error('FLAGGER: Error fetching holders:', err);
            break;
        }
    }

    console.log("FLAGGER: ALl HOLDERS COUNT", allHolders.length)
    return allHolders;
}

const multiCallReadData = async (wallets) => {
    const { liquidatorContract, synthetixContract, multicallContract } = createContracts();

    const collateralRatioCalls = wallets.map((wallet) => ({
        target: synthetixContract.address,
        callData: synthetixContract.interface.encodeFunctionData('collateralisationRatio', [wallet.address]),
        allowFailure: true,
    }));

    const debtBalanceOfCalls = wallets.map((wallet) => ({
        target: synthetixContract.address,
        callData: synthetixContract.interface.encodeFunctionData('debtBalanceOf', [wallet.address, '0x7a55534400000000000000000000000000000000000000000000000000000000']),
        allowFailure: true,
    }));

    const liquidationDeadlineCalls = wallets.map((wallet) => ({
        target: liquidatorContract.address,
        // callData: liquidatorContract.interface.encodeFunctionData('getLiquidationDeadlineForAccount', ['0x8f5992efdcb6e2656418458d8f981c778436ea26']),
        callData: liquidatorContract.interface.encodeFunctionData('getLiquidationDeadlineForAccount', [wallet.address]),
        allowFailure: true,
    }));

    const collateralRatio_callResult = await multicallContract.callStatic.aggregate3(collateralRatioCalls);
    const debtBalanceOf_callResult = await multicallContract.callStatic.aggregate3(debtBalanceOfCalls);
    const liquidationDeadline_callResult = await multicallContract.callStatic.aggregate3(liquidationDeadlineCalls);

    // console.log('FLAGGER: callResult', callResult);

    if (collateralRatio_callResult.length === debtBalanceOf_callResult.length) {
        for (let i = 0; i < collateralRatio_callResult.length; i++) {
            const cratio = ethers.BigNumber.from(collateralRatio_callResult[i].returnData);
            const debtBalanceOf = ethers.BigNumber.from(debtBalanceOf_callResult[i].returnData);
            const deadline = ethers.BigNumber.from(liquidationDeadline_callResult[i].returnData);
            // console.log('FLAGGER: deadline', deadline.toString());

            wallets[i].contract_debtBalanceOf = debtBalanceOf;
            wallets[i].formatted_contract_debtBalanceOf = formatEther(debtBalanceOf);
            wallets[i].cratio = cratio;
            wallets[i].formattedCratio = formatCratio(cratio);
            wallets[i].liquidationDeadline = deadline.toString();
        }
    }

    // console.log('FLAGGER: wallets', wallets);
    // console.log('FLAGGER: wallets', wallets.length);

    return wallets;
};

const filterFlaggableWithDebt = async (wallets, minDebt = '100') => {
    const { liquidatorContract } = createContracts();

    const lratio = await liquidatorContract.liquidationRatio();

    return wallets.filter((item) => {
        // console.log('FLAGGER:item', item.liquidationDeadline, item.liquidationDeadline == 0)
        return item.cratio.gt(lratio) && item.contract_debtBalanceOf.gt(parseEther(minDebt)) && item.liquidationDeadline == 0;
    });
    // return wallets.filter((item) => item.cratio.gt(lratio) && item.contract_debtBalanceOf.gt(parseEther(minDebt)));
}

// Flag accounts for liquidation
const flagForLiquidation = async (walletsReadyForFlagging) => {
    const wallet = new ethers.Wallet(account);
    const providerWallet = wallet.connect(rpcprovider);
    const { liquidatorContract, synthetixContract, multicallContract } = createContracts();

    for (const wallet of walletsReadyForFlagging) {
        const cratio = await synthetixContract.collateralisationRatio(wallet.address);
        const liquidationRatio = await liquidatorContract.liquidationRatio();
        const deadline = await liquidatorContract.getLiquidationDeadlineForAccount(wallet.address);

        if (cratio.gt(liquidationRatio) && deadline.isZero()) {
            console.log('FLAGGER: Flagging account for liquidation:', wallet.address);
            const signerContract = liquidatorContract.connect(providerWallet);
            const tx = await signerContract.flagAccountForLiquidation(wallet.address);
            await tx.wait(1);
            console.log('FLAGGER: Transaction hash:', tx.hash);
        }
    }
};

// Format collateralisation ratio
const formatCratio = (amount) => amount != 0 ? 100 / formatEther(amount) : 0;

// Main function
async function flagger() {
    while (true) {
        try {
            const holders = await fetchPotentialHolders();
            // console.log("FLAGGER: holders", holders);

            const holdersData = await multiCallReadData(holders);

            if (holdersData.length != 0) {
                const flaggableForLiquidation = await filterFlaggableWithDebt(holdersData, minimum_debt);

                console.log("FLAGGER: flaggableForLiquidation", flaggableForLiquidation);
                console.log("FLAGGER: flaggableForLiquidation", flaggableForLiquidation.length);

                if (flaggableForLiquidation.length === 0) {
                    console.log('FLAGGER: No accounts found for liquidation.');
                } else {
                    await flagForLiquidation(flaggableForLiquidation);
                }
            }

            await new Promise(res => setTimeout(res, restart_timeout));

        } catch (error) {
            console.error(`FLAGGER: error ${error}`);
            // await sendTG(`MAIN_KEEPER - ${(error as Error).toString()}}`)
            await new Promise(res => setTimeout(res, restart_timeout));
            continue;
        }
    }

}

module.exports = { flagger };

// flagger()
