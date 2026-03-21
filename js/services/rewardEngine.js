console.log("INSIDE rewardEngine.js FILE NOW");

module.exports = async function (inputDate = new Date()) {
  return {
    success: true,
    message: "reward engine direct export works",
    cycle_date: new Date(inputDate).toISOString().slice(0, 10)
  };
};