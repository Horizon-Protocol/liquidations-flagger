require('dotenv').config()
const { ethers } = require('ethers');
const WebSocketProvider = require('./customWebsocket');

const testnode = process.env.PROVIDER_URL;
const network = process.env.NETWORK || 'bsc';
const account = process.env.PVT_KEY;
const graph_endpoint = process.env.GRAPH_ENDPOINT;
const restart_timeout = process.env.RESTART_TIMEOUT;
const minimum_debt = process.env.MIN_DEBT
const synthetixAddress = process.env.SYNTHETIX;
const liquidatorAddress = process.env.LIQUIDATOR;
const multicallAddress = '0xcA11bde05977b3631167028862bE2a173976CA11';

const ABI = [
	"function collateralisationRatio(address _issuer) external view returns (uint256)",
	"function debtBalanceOf(address account,bytes32 currencyKey) external view returns (uint256)",
    "function getLiquidationDeadlineForAccount(address account) external view returns (uint)",
    "function liquidationRatio() external view returns (uint)",
    "function flagAccountForLiquidation(address account) external returns (bool)",
    "function liquidateDelinquentAccount(address account) external returns (bool)",
    
    "event AccountFlaggedForLiquidation(address indexed account, uint deadline)",
    "event AccountRemovedFromLiquidation(address indexed account, uint256 time)",
    
    'function aggregate(tuple(address target, bytes callData)[] calls) payable returns (uint256 blockNumber, bytes[] returnData)',
    'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
];

const rpcprovider = new ethers.providers.JsonRpcProvider(testnode);
const wsprovider = new WebSocketProvider(testnode.replace(/https/, 'wss'));
const liquidatorEventsContract = new ethers.Contract(liquidatorAddress, ABI, wsprovider);

const createContracts = () => {
    const liquidatorContract = new ethers.Contract(liquidatorAddress, ABI, rpcprovider);
    const synthetixContract = new ethers.Contract(synthetixAddress, ABI, rpcprovider);
    const multicallContract = new ethers.Contract(multicallAddress, ABI, rpcprovider);

    return { liquidatorContract, synthetixContract, multicallContract };
}

module.exports = {
    rpcprovider,
    graph_endpoint,
    network,
    account,
    createContracts,
    liquidatorEventsContract,
    restart_timeout,
    minimum_debt,
}