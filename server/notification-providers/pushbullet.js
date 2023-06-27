const NotificationProvider = require("./notification-provider");
const axios = require("axios");

const { DOWN, UP } = require("../../src/util");

class Pushbullet extends NotificationProvider {

    name = "pushbullet";

    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        let okMsg = "Sent Successfully.";

        try {
            let pushbulletUrl = "https://api.pushbullet.com/v2/pushes";
            let config = {
                headers: {
                    "Access-Token": notification.pushbulletAccessToken,
                    "Content-Type": "application/json"
                }
            };
            if (heartbeatJSON == null) {
                let data = {
                    "type": "note",
                    "title": "Uptime Kuma Alert",
                    "body": msg,
                };
                await axios.post(pushbulletUrl, data, config);
            } else if (heartbeatJSON["status"] === DOWN) {
                let downData = {
                    "type": "note",
                    "title": "UptimeKuma Alert: " + monitorJSON["name"],
                    "body": "[🔴 Down] " +
                        heartbeatJSON["msg"] +
                        `\nTime (${heartbeatJSON["timezone"]}): ${heartbeatJSON["localDateTime"]}`,
                };
                await axios.post(pushbulletUrl, downData, config);
            } else if (heartbeatJSON["status"] === UP) {
                let upData = {
                    "type": "note",
                    "title": "UptimeKuma Alert: " + monitorJSON["name"],
                    "body": "[✅ Up] " +
                        heartbeatJSON["msg"] +
                        `\nTime (${heartbeatJSON["timezone"]}): ${heartbeatJSON["localDateTime"]}`,
                };
                await axios.post(pushbulletUrl, upData, config);
            }
            return okMsg;
        } catch (error) {
            this.throwGeneralAxiosError(error);
        }
    }
}

module.exports = Pushbullet;
