require('dotenv').config()

// const graph_endpoint = 'https://api.thegraph.com/subgraphs/name/horizon-protocol/mainnet-issuance';
const graph_endpoint = 'https://api.thegraph.com/subgraphs/name/rout-horizon/bsc7-issuance';

const testnode = process.env.PROVIDER_URL;
const account = process.env.ACCOUNT;

// Synthetix Contract
const synthetixAddress = "0xC0eFf7749b125444953ef89682201Fb8c6A917CD";
const synthetixJson = [
	"function collateralisationRatio(address _issuer) external view returns (uint256)",
	"function debtBalanceOf(address _issuer, bytes32 currencyKey) external view returns (uint256)",
];
// Liquidator Contract
const liquidatorAddress = "0x2a7B78b705ea48d278D673e80c880D7EB479F44C";
const issuerAddress = "0x2841052140b4eCA63c8ef0bd52c4818eEFD5146B";

const liquidatorJson = [
    "function getLiquidationDeadlineForAccount(address account) external view returns (uint)",
    "function liquidationRatio() external view returns (uint)",
    "function flagAccountForLiquidation(address account) external returns (bool)",
    "function liquidationAmounts(address account, bool isSelfLiquidation) external view returns (uint256 totalRedeemed,uint256 debtToRemove,uint256 escrowToLiquidate,uint256 initialDebtBalance)",
];

const gasOptions = {
    maxPriorityFeePerGas: "3000000000",
    maxFeePerGas: "3000000000",
}

const debtThreshold = '25'

module.exports = {
    graph_endpoint,
    testnode,
    synthetixAddress,
    synthetixJson,
    liquidatorAddress,
    issuerAddress,
    liquidatorJson,
    account,
    gasOptions,
    debtThreshold,
}