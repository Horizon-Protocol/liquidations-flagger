const fs = require('fs');
const { network } = require('./utils');

const flaggedOrdersFile = `data/${network}/flagged-accounts.json`;

const showFlaggedPositions = () => {
    if (fs.existsSync(flaggedOrdersFile)) {
        const fileContent = fs.readFileSync(flaggedOrdersFile, "utf8");
        return JSON.parse(fileContent);
    }
    return [];
};

const saveFlaggedPositions = (data) => {
    fs.writeFileSync(flaggedOrdersFile, JSON.stringify(data, null, 2), "utf8");
};

function pushFlaggedPositions(account, transactionHash) {
    let orders = showFlaggedPositions();

    // Check for duplicate orders
    const orderExists = orders.some(order =>
        order.account === account && order.transactionHash === transactionHash
    );

    if (!orderExists) {
        orders.push({
            account: account,
            transactionHash: transactionHash,
        });
    }

    saveFlaggedPositions(orders);
}

function deleteFlaggedPositions(account) {
    let flaggedPositions = showFlaggedPositions();

    let order = flaggedPositions.find(order => (order.account === account));
    if (order) {
        // Remove from flaggedPositions
        flaggedPositions = flaggedPositions.filter(order => !(order.account === account));
        saveFlaggedPositions(flaggedPositions);
    }
}

module.exports = {
    showFlaggedPositions,
    pushFlaggedPositions,
    deleteFlaggedPositions,
}
