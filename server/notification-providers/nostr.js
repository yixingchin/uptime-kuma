const NotificationProvider = require("./notification-provider");
// polyfill for node <= 18
global.crypto = require("crypto");
const {
    relayInit,
    getPublicKey,
    getEventHash,
    signEvent,
    nip04,
    nip19
} = require("nostr-tools");
// polyfill for node <= 18
require("websocket-polyfill");

class Nostr extends NotificationProvider {
    name = "nostr";

    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        // All DMs should have same timestamp
        const createdAt = Math.floor(Date.now() / 1000);

        const senderPrivateKey = await this.getPrivateKey(notification.sender);
        const senderPublicKey = getPublicKey(senderPrivateKey);
        const recipientsPublicKeys = await this.getPublicKeys(notification.recipients);

        // Create NIP-04 encrypted direct message event for each recipient
        const events = [];
        for (const recipientPublicKey of recipientsPublicKeys) {
            const ciphertext = await nip04.encrypt(senderPrivateKey, recipientPublicKey, msg);
            let event = {
                kind: 4,
                pubkey: senderPublicKey,
                created_at: createdAt,
                tags: [[ "p", recipientPublicKey ]],
                content: ciphertext,
            };
            event.id = getEventHash(event);
            event.sig = signEvent(event, senderPrivateKey);
            events.push(event);
        }

        // Publish events to each relay
        const relays = notification.relays.split("\n");
        let successfulRelays = 0;

        // Connect to each relay
        for (const relayUrl of relays) {
            const relay = relayInit(relayUrl);
            try {
                await relay.connect();
                successfulRelays++;

                // Publish events
                for (const event of events) {
                    relay.publish(event);
                }
            } catch (error) {
                continue;
            } finally {
                relay.close();
            }
        }

        // Report success or failure
        if (successfulRelays === 0) {
            throw Error("Failed to connect to any relays.");
        }
        return `${successfulRelays}/${relays.length} relays connected.`;
    }

    async getPrivateKey(sender) {
        try {
            const senderDecodeResult = await nip19.decode(sender);
            const { data } = senderDecodeResult;
            return data;
        } catch (error) {
            throw new Error(`Failed to get private key: ${error.message}`);
        }
    }

    async getPublicKeys(recipients) {
        const recipientsList = recipients.split("\n");
        const publicKeys = [];
        for (const recipient of recipientsList) {
            try {
                const recipientDecodeResult = await nip19.decode(recipient);
                const { type, data } = recipientDecodeResult;
                if (type === "npub") {
                    publicKeys.push(data);
                } else {
                    throw new Error("not an npub");
                }
            } catch (error) {
                throw new Error(`Error decoding recipient: ${error}`);
            }
        }
        return publicKeys;
    }
}

module.exports = Nostr;
