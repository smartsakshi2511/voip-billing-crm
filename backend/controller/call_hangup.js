const AsteriskManager = require("asterisk-manager");

// Asterisk AMI credentials
const host = "localhost";
const port = 5038;
const username = "cron";
const password = "1234";

// Function to hangup a channel
exports.hangupChannel = (req, res) => {
  const { channel } = req.body; // channel comes from POST body

  if (!channel) {
    return res.status(400).json({ status: "error", message: "Channel is required." });
  }

  // Connect to AMI
  const ami = new AsteriskManager(port, host, username, password, true);

  ami.keepConnected();

  // Send Hangup Action
  ami.action(
    {
      Action: "Hangup",
      Channel: channel,
    },
    (err, response) => {
      if (err) {
        console.error("AMI Error:", err);
        return res.status(500).json({ status: "error", message: "AMI connection error" });
      }

      if (response && response.Response === "Success") {
        return res.json({
          status: "success",
          message: `Channel ${channel} hung up successfully.`,
        });
      } else {
        return res.json({
          status: "error",
          message: `Failed to hang up channel. Raw response: ${JSON.stringify(response)}`,
        });
      }
    }
  );
};
