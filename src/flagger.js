const { ethers } = require('ethers');
const { parseEther, formatEther } = require('ethers/lib/utils');
const { Contract, Provider } = require('ethers-multicall2');
const pageResults = require('graph-results-pager');
const fs = require('fs');

const { graph_endpoint,
    testnode,
    synthetixAddress,
    synthetixJson,
    liquidatorAddress,
    liquidatorJson,
    account,
    gasOptions, 
    issuerAddress,
    debtThreshold} = require('../config');


const multiCallReadCratios = async (wallets) => {
    // ethers initializations

    const ethersprovider = new ethers.providers.JsonRpcProvider(testnode);
    const ethcallProvider = new Provider(ethersprovider);
    const synthetixContract = new Contract(synthetixAddress, synthetixJson);
    const liquidationContract = new Contract(liquidatorAddress, liquidatorJson);
    const issuerContract = new Contract(issuerAddress, liquidatorJson);

    // console.log(liquidationContract);
    let contractCallsCRatio = [];

    await ethcallProvider.init();

    // console.log("fetchPotentialHolders", wallets);

    for (let index = 0; index < wallets.length; index++) {
        contractCallsCRatio.push(synthetixContract.collateralisationRatio(wallets[index].address.toString()));
    }
    const resultsCRatio = await ethcallProvider.all(contractCallsCRatio);
    // Join results with original call context
    if (wallets.length == resultsCRatio.length) {
        for (let index = 0; index < resultsCRatio.length; index++) {
            wallets[index].cratio = resultsCRatio[index];
            wallets[index].formattedCratio = formatCratio(resultsCRatio[index]);
        }
    } else {
        throw ('Results from multicall are not same as holders');
    }


    let contractCallsDebt= [];
    for (let index = 0; index < wallets.length; index++) {
        contractCallsDebt.push(synthetixContract.debtBalanceOf(wallets[index].address.toString(), '0x7a55534400000000000000000000000000000000000000000000000000000000'));
    }
    const resultsDebtBalance = await ethcallProvider.all(contractCallsDebt);
    // Join results with original call context
    if (wallets.length == resultsDebtBalance.length) {
        for (let index = 0; index < resultsDebtBalance.length; index++) {
            wallets[index].debtBalanceOf = resultsDebtBalance[index];
            wallets[index].formattedDebtBalanceOf = formatEther(resultsDebtBalance[index]);
        }
    } else {
        throw ('Results from multicall are not same as holders');
    }

    // let contractCallsLiqAmounts= [];
    // for (let index = 0; index < wallets.length; index++) {
    //     contractCallsLiqAmounts.push(issuerContract.liquidationAmounts(wallets[index].address.toString(), false));
    // }
    // const resultsLiqAmounts1 = await ethcallProvider.all(contractCallsLiqAmounts.slice(0, 1));
    // const resultsLiqAmounts2 = await ethcallProvider.all(contractCallsLiqAmounts.slice(Math.ceil(contractCallsLiqAmounts.length / 2)));
    // console.log(resultsLiqAmounts1);
    // // Join results with original call context
    // if (wallets.length == resultsLiqAmounts.length) {
    //     for (let index = 0; index < resultsLiqAmounts.length; index++) {
    //         wallets[index].totalRedeemed = formatEther(resultsLiqAmounts[index].totalRedeemed);
    //         wallets[index].debtToRemove = formatEther(resultsLiqAmounts[index].debtToRemove);
    //         wallets[index].escrowToLiquidate = formatEther(resultsLiqAmounts[index].escrowToLiquidate);
    //         wallets[index].initialDebtBalance = formatEther(resultsLiqAmounts[index].initialDebtBalance);
    //     }
    // } else {
    //     throw ('Results from multicall are not same as holders');
    // }

    console.log(`Found a total of ${wallets.length} active stakers.`);
    // })

    const lratio = await getLiquidationRatio();
    const filteredLiquidatable = wallets.filter((item) => item.cratio.gt(lratio) && item.debtBalanceOf.gt(ethers.utils.parseEther(debtThreshold)));

    return filteredLiquidatable;

}


async function fetchPotentialHolders() {
    // Uses graph protocol to run through SNX contract. Since there is a limit of 100 results per query
    // we can use graph-results-pager library to increase the limit.
    return pageResults({
        api: graph_endpoint, // Need to update when moving to a subgraph hosted service
        // api: graph_endpoint, // Need to update when moving to a subgraph hosted service
        // max: 10000,         // Currently there are around 8k holders.This can be updated
        timeout: 10e3,
        query: {
            entity: 'activeStakers',
            selection: {
                orderBy: 'debtBalanceOf',
                orderDirection: 'desc',
                where: {
                    debtBalanceOf_gte: Number(0)
                },
            },
            properties: [
                'id', // the address of the holder
                'collateral', // Synthetix.collateral (all collateral the account has, including escrowed )
                'debtBalanceOf',
            ],
        },
    })
        .then(results => results.map(({ id, debtBalanceOf }) => ({
            address: id,
            cratio: 0,
            formattedCratio: 0,
            debtBalanceOf: debtBalanceOf
        })
        ))
        .catch(err => console.error(err));
}


const flagForLiquidation = async (walletsReadyforFlagging) => {    
    const provider = new ethers.providers.JsonRpcProvider(testnode);
    const wallet = new ethers.Wallet(account);
    const providerWallet = wallet.connect(provider);
    const synthetixContract = new ethers.Contract(synthetixAddress, synthetixJson, provider);
    const liquidatorContract = new ethers.Contract(liquidatorAddress, liquidatorJson, provider);

    // for (let index = 0; index < 1; index++) {
    for (let index = 0; index < walletsReadyforFlagging.length; index++) {
        const wallet = walletsReadyforFlagging[index];
        const cratio = await synthetixContract.collateralisationRatio(wallet.address);
        const liquidationRatio = await liquidatorContract.liquidationRatio();
        const deadline = await liquidatorContract.getLiquidationDeadlineForAccount(wallet.address);

        const flag = cratio.gt(liquidationRatio);
        // console.log("Logic reaching here........... ", deadline.isZero());
        if (flag && deadline.isZero()) {
            console.log("Accounts ready for flagging(liquidation)", wallet.address);

            const signerContract = liquidatorContract.connect(providerWallet);
            let txHash = await signerContract.flagAccountForLiquidation(wallet.address, gasOptions);
            await txHash.wait(1);
            console.log('txHash', txHash);
        }
        continue;
    }

}

const getLiquidationRatio = async () => { 
    const provider = new ethers.providers.JsonRpcProvider(testnode);
    const liquidatorContract = new ethers.Contract(liquidatorAddress, liquidatorJson, provider);

    const liquidationRatio = await liquidatorContract.liquidationRatio();
    return liquidationRatio;
 }


async function flagger() {
    const holders = await fetchPotentialHolders();
    console.log("holders", holders.length);
    // fs.writeFileSync('holders.json', JSON.stringify(holders))

    
    const flaggableForLiquidation = await multiCallReadCratios(holders);
    // console.log("flaggableForLiquidation", flaggableForLiquidation);

    console.log("flaggableForLiquidation", flaggableForLiquidation.length);
    fs.writeFileSync('flags.json', JSON.stringify(flaggableForLiquidation))

    if (!(flaggableForLiquidation.length > 0)) {
        console.log("No accounts found for Liquidations");
    } else {
        await flagForLiquidation(flaggableForLiquidation);
    }
}

const formatCratio= (amount) => {
    const ratio = 100/formatEther(amount);
    return ratio
}

module.exports = {
    flagger
}

// flagger();