const mongoose = require("mongoose");

const MarketSettingsSchema = new mongoose.Schema({
  holidayClosed: { type: Boolean, default: false },

  mondayOpen: { type: Boolean, default: true },
  tuesdayOpen: { type: Boolean, default: true },
  wednesdayOpen: { type: Boolean, default: true },
  thursdayOpen: { type: Boolean, default: true },
  fridayOpen: { type: Boolean, default: true },
  saturdayOpen: { type: Boolean, default: false },
  sundayOpen: { type: Boolean, default: false },

  mondayOpenTime: { type: String, default: "09:00" },
  mondayCloseTime: { type: String, default: "17:00" },

  tuesdayOpenTime: { type: String, default: "09:00" },
  tuesdayCloseTime: { type: String, default: "17:00" },

  wednesdayOpenTime: { type: String, default: "09:00" },
  wednesdayCloseTime: { type: String, default: "17:00" },

  thursdayOpenTime: { type: String, default: "09:00" },
  thursdayCloseTime: { type: String, default: "17:00" },

  fridayOpenTime: { type: String, default: "09:00" },
  fridayCloseTime: { type: String, default: "17:00" },

  saturdayOpenTime: { type: String, default: "00:00" },
  saturdayCloseTime: { type: String, default: "00:00" },

  sundayOpenTime: { type: String, default: "00:00" },
  sundayCloseTime: { type: String, default: "00:00" },
});

module.exports = mongoose.model("MarketSettings", MarketSettingsSchema);
