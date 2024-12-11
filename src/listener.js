const { pushFlaggedPositions, deleteFlaggedPositions } = require('./state.js');
const { liquidatorEventsContract } = require('./utils');

let lastEventTimes;

const listenEvents = async () => {
    // const { liquidatorContract } = createContracts();

    // Initialize the last event time for the market and provider
    lastEventTimes = Date.now();

    const handleAccountFlaggedForLiquidation = (
        account,
        deadline,
        event
    ) => {
        try {
            lastEventTimes = Date.now(); // Update event timestamp
            console.log('EVENT RECEIVED: AccountFlaggedForLiquidation received', account, deadline.toString(), event.transactionHash, event.blockNumber);
            pushFlaggedPositions(account, event.transactionHash);
        } catch (err) {
            console.error("EVENT RECEIVED: Error handling AccountFlaggedForLiquidation event:", err);
        }
    };

    const handleAccountRemovedFromLiquidation = (
        account,
        time,
        event
    ) => {
        try {
            lastEventTimes = Date.now(); // Update event timestamp
            console.log('EVENT RECEIVED: AccountRemovedFromLiquidation', account, time.toString(), event.transactionHash, event.blockNumber);
            deleteFlaggedPositions(account);
        } catch (error) {
            console.error("EVENT RECEIVED: Error handling AccountFlaggedForLiquidation event:", error);
        }
    };
    
    liquidatorEventsContract.on("AccountFlaggedForLiquidation", handleAccountFlaggedForLiquidation);
    liquidatorEventsContract.on("AccountRemovedFromLiquidation", handleAccountRemovedFromLiquidation);

    liquidatorEventsContract.on("*", (event) => console.log("Event received:", event));

    console.log('LiquidatorContract started listening events....')

    // Monitor and re-initialize the listener if necessary
    monitorListener(liquidatorEventsContract, handleAccountFlaggedForLiquidation, handleAccountRemovedFromLiquidation);
}

// Function to monitor and re-initialize the listener if necessary
const monitorListener = (contract, handleAccountFlaggedForLiquidation, handleAccountRemovedFromLiquidation) => {
    setInterval(() => {
        const currentTime = Date.now();
        const timeElapsed = currentTime - lastEventTimes;

        console.log('timeElapsed', timeElapsed);

        // If no events have been received for 10 minutes, re-initialize the listener
        if (timeElapsed >= 600000) {
            console.log(`No events received in the last 10 minutes. Re-initializing listeners ...`);
            contract.removeListener("AccountFlaggedForLiquidation", handleAccountFlaggedForLiquidation);
            contract.removeListener("AccountRemovedFromLiquidation", handleAccountRemovedFromLiquidation);

            contract.on("AccountFlaggedForLiquidation", handleAccountFlaggedForLiquidation);
            contract.on("AccountRemovedFromLiquidation", handleAccountRemovedFromLiquidation);

            lastEventTimes = Date.now(); // Reset the last event time
        }
    }, 600000); // Check every 10 minutes
};

module.exports = {
    listenEvents,

}

// Start listening to events
// listenEvents()