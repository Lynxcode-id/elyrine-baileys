import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js';
import { prepareModernMessageContent } from '../Utils/modern-messages.js';
import { makeNewsletterStatusFetcher, makeNewsletterStatusUpdatesFetcher, makeNewsletterStatusReactionSender, makeNewsletterStatusRevokeSender, makeNewsletterStatusSender } from '../Utils/newsletter-status.js';
import { bindVoiceRecognition } from '../Utils/voice-recognition.js';
import { makeCommunitiesSocket } from './communities.js';
// export the last socket layer
const makeWASocket = (config) => {
    const newConfig = {
        ...DEFAULT_CONNECTION_CONFIG,
        ...config
    };
    const sock = makeCommunitiesSocket(newConfig);
    bindVoiceRecognition(sock, newConfig);
    const sendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = (jid, content, options = {}) => sendMessage(jid, prepareModernMessageContent(content), options);
    sock.sendNewsletterStatus = makeNewsletterStatusSender(sock, newConfig);
    sock.sendNewsletterStatusReaction = makeNewsletterStatusReactionSender(sock);
    sock.revokeNewsletterStatus = makeNewsletterStatusRevokeSender(sock);
    sock.getNewsletterStatuses = makeNewsletterStatusFetcher(sock);
    sock.getNewsletterStatusUpdates = makeNewsletterStatusUpdatesFetcher(sock);
    // Optional anti-crash / anti-bug guard: pass `AnchorGuard: true` (needs the optional package installed)
    if (newConfig.AnchorGuard) {
        import('@rexxhayanasi/elaina-anchorguard')
            .then(({ createAntiBugGuard }) => {
            sock.anchorGuard = createAntiBugGuard(sock, { logger: sock.logger, ...(newConfig.AnchorGuardConfig || {}) });
        })
            .catch((error) => {
            sock.logger?.warn?.({ error: error.message }, 'AnchorGuard is enabled but the optional package is missing. Run: npm install @rexxhayanasi/elaina-anchorguard');
        });
    }
    return sock;
};
export default makeWASocket;
