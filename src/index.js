const { flagger } = require("./flagger");
const { listenEvents } = require("./listener");
const { executeLiquidations } = require("./liquidator");

const main = async () => {
    listenEvents();
    flagger();
    executeLiquidations();
}

main()