import { Button } from '@vanzxy/baileys';

/**
 * Command: .testbtn / .nativeflow
 * Description: Native flow buttons test කිරීම සඳහා
 */
export default {
    name: 'testbtn',
    alias: ['nativeflow', 'btncheck'],
    category: 'test',
    async execute({ sock, msg, from }) {
        try {
            // Button class එකෙන් Native Flow message එකක් build කිරීම
            const flowMessage = new Button(sock)
                .setTitle('🚀 Native Flow Test Panel')
                .setBody('Native Flow buttons WhatsApp mobile app එකේ render වෙන විදිහ පහතින් බලන්න.')
                .setFooter('Powered by @vanzxy/baileys')
                // 1. Quick Reply Button (Click කරපු ගමන් message එකක් bot ට යවනවා)
                .addReply('Ping Bot 🏓', '.ping')
                // 2. Direct URL Link Button
                .addUrl('GitHub Repo 🌐', 'https://github.com/vanzxysenpai/vanzxybaileys')
                // 3. Direct Phone Call Button
                .addCall('Developer Call 📞', '94712345678');

            // Message එක අදාළ JID (chat) එකට send කිරීම
            await flowMessage.send(from);

        } catch (error) {
            console.error('Native Flow Button Error:', error);
            await sock.sendMessage(from, { 
                text: '❌ Buttons send කිරීමේදී දෝෂයක් ආවා: ' + error.message 
            }, { quoted: msg });
        }
    }
};
