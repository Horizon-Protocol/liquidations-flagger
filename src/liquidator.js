const { Contract, providers, ethers } = require("ethers");
const { showFlaggedPositions } = require('./state');
const {
    rpcprovider,
    createContracts,
    restart_timeout,
} = require('./utils');

const MULTICALL_PAGE_SIZE = 20;
// const restart_timeout = 5000;

async function executeLiquidations() {
    while (true) {
        try {
            const { synthetixContract, multicallContract } = createContracts();

            // 1. Execute the orders
            let openPositions = showFlaggedPositions();
            if (openPositions.length > 0) {
                console.log("LIQUIDATOR: open Flagged Positions.....", openPositions.length);

                const pageSize = MULTICALL_PAGE_SIZE;

                // Array to store promises for each callStatic result
                // const staticCallPromises: Promise<any>[] = [];
                const staticCallPromises = [];

                // Paginate the openPositions
                for (let i = 0; i < openPositions.length; i += pageSize) {
                    const paginatedOrders = openPositions.slice(i, i + pageSize);

                    // console.log("paginatedOrders.....", i, paginatedOrders.length);

                    const staticCalls = paginatedOrders.map(order => {
                        return {
                            target: synthetixContract.address,
                            callData: synthetixContract.interface.encodeFunctionData("liquidateDelinquentAccount", [order.account]),
                            allowFailure: true,
                        }
                    })

                    // console.log("staticCalls.....", staticCalls.length);

                    // Add the static call to the promises array
                    staticCallPromises.push(multicallContract.callStatic.aggregate3(staticCalls));
                }

                // type STATIC_CALL_RESULT = {
                //     success: boolean,
                //     returnData: string,
                // }
                // console.log(`Ready to execute: ${staticCallPromises.length}`);

                // Execute all static calls in parallel and accumulate results
                const staticResultsArray = await Promise.all(staticCallPromises);
                // const staticResultsArray: STATIC_CALL_RESULT[][] = await Promise.all(staticCallPromises);

                console.log(`LIQUIDATOR: staticResultsArray: ${staticResultsArray.length}`);

                let successfulPositions = [];
                // let successfulPositions: IPOSITION[] = [];

                // Filter positions that can be flagged
                // staticResultsArray.forEach((staticResults: STATIC_CALL_RESULT[], index) => {
                staticResultsArray.forEach((staticResults, index) => {
                    const paginatedOrders = openPositions.slice(index * pageSize, (index + 1) * pageSize);
                    const successfulPagePositions = paginatedOrders.filter((_, i) => staticResults[i].success);
                    successfulPositions = successfulPositions.concat(successfulPagePositions);
                });

                console.log('LIQUIDATOR: successfulPositions', successfulPositions);
                console.log(`LIQUIDATOR: Ready to execute: ${successfulPositions.length}`);
                if (successfulPositions.length > 0) {
                    for (const position of successfulPositions) {
                        const marketContract = new Contract(position.proxyContract, contractABI, signer)
                        // Estimate gas and gasprice
                        const gasLimit = await marketContract.estimateGas.liquidateDelinquentAccount(position.account);
                        const gasPrice = await rpcprovider.getGasPrice();

                        // Execute the transaction
                        const flagTx = await marketContract.liquidateDelinquentAccount(position.account, {
                            gasLimit: gasLimit.mul(6).div(5),
                            gasPrice: gasPrice.mul(6).div(5),
                        });

                        await flagTx.wait(1);
                        console.log("LIQUIDATOR: Flagging tx.....", flagTx.hash);

                    }

                    // // Create the actual execution payload
                    // const executeCalls = successfulPositions.slice(0, pageSize).map(order => {
                    //     return {
                    //         target: order.proxyContract,
                    //         callData: marketInterface.encodeFunctionData("liquidatePosition", [order.account]),
                    //         allowFailure: true,
                    //     }
                    // });

                    // // Estimate gas and gasprice
                    // const gasLimit = await multicallContract.estimateGas.aggregate3(executeCalls);
                    // const gasPrice = await rpcprovider.getGasPrice();

                    // console.log(`LIQUIDATOR: ERROR_KEEPER: GasLimit: ${gasLimit.toString()}, GasPrice: ${gasPrice.toString()}`);

                    // // Execute the transaction
                    // const flagTx = await multicallContract.aggregate3(executeCalls, {
                    //     gasLimit: gasLimit.mul(6).div(5),
                    //     gasPrice: gasPrice.mul(6).div(5),
                    // });

                    // await flagTx.wait(1);
                    // console.log("LIQUIDATOR: Flagging tx.....", flagTx.hash);
                }
                else {
                    console.log("LIQUIDATOR: No Positions Flagged Restarting.....");
                    // No task available, wait a bit before retrying, Ideally for bsc it's 3 seconds
                    await new Promise(res => setTimeout(res, restart_timeout));
                    continue;
                }
            }
            else {
                console.log("LIQUIDATOR: No Positions Flagged Restarting.....");
                // No task available, wait a bit before retrying, Ideally for bsc it's 3 seconds
                await new Promise(res => setTimeout(res, restart_timeout));
                continue;
            }
        }
        catch (error) {
            console.error(`LIQUIDATOR: error ${error}`);
            // await sendTG(`MAIN_KEEPER - ${(error as Error).toString()}}`)
            await new Promise(res => setTimeout(res, restart_timeout));
            continue;
        }
    }
}

module.exports = {
    executeLiquidations,
}