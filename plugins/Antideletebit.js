/**
 * Self Delete Reporter Plugin for WALinn - English Version
 * Sends deleted messages back to the person who deleted them
 * No main file editing required
 */

const fs = require('fs');
const path = require('path');

module.exports = function EnglishSelfDeleteReporter(bot, options = {}) {
    console.log('[EnglishSelfDeleteReporter] Plugin initialized ✅');
    
    // Default configuration
    const config = {
        enabled: true,
        selfReport: true,
        cooldown: 30000, // 30 seconds
        excludeNumbers: [],
        notifyAdmin: false,
        adminNumber: "", // Add admin number here if needed
        logToConsole: true,
        logToFile: false,
        ...options
    };
    
    // Data storage
    const messageCache = new Map();
    const cooldownMap = new Map();
    const logFile = path.join(__dirname, 'delete-logs.txt');
    
    // Create log file if needed
    if (config.logToFile) {
        try {
            if (!fs.existsSync(logFile)) {
                fs.writeFileSync(logFile, '=== Deleted Messages Log ===\n\n');
            }
        } catch (error) {
            console.error('[EnglishSelfDeleteReporter] Log file error:', error);
        }
    }
    
    // ===== EVENT LISTENERS =====
    
    // Cache all incoming messages
    bot.on('message', async (msg) => {
        try {
            if (!msg.id || msg.from === 'status@broadcast') return;
            
            // Store message in cache
            messageCache.set(msg.id, {
                id: msg.id,
                body: msg.body || '',
                from: msg.from,
                sender: msg.author || msg.from,
                timestamp: new Date(),
                hasMedia: msg.hasMedia,
                type: msg.type,
                isGroup: msg.isGroup,
                caption: msg.caption || ''
            });
            
            // Auto cleanup after 10 minutes
            setTimeout(() => {
                messageCache.delete(msg.id);
            }, 10 * 60 * 1000);
            
        } catch (error) {
            console.error('[EnglishSelfDeleteReporter] Cache error:', error);
        }
    });
    
    // Listen for deleted messages
    bot.on('message_revoke_everyone', async (deletedMsg) => {
        if (!config.enabled) return;
        
        try {
            // Get original message from cache
            const originalMsg = messageCache.get(deletedMsg.id);
            if (!originalMsg) {
                if (config.logToConsole) {
                    console.log('[EnglishSelfDeleteReporter] Original message not found in cache');
                }
                return;
            }
            
            const deleterId = deletedMsg.author || deletedMsg.from;
            const originalSender = originalMsg.sender;
            
            // Verify deleter is the original sender
            if (deleterId !== originalSender) {
                console.log('[EnglishSelfDeleteReporter] Someone else deleted the message');
                return;
            }
            
            // Check excluded numbers
            const phoneNumber = deleterId.replace('@c.us', '');
            if (config.excludeNumbers.includes(phoneNumber)) {
                return;
            }
            
            // Check cooldown
            if (cooldownMap.has(deleterId)) {
                const lastReport = cooldownMap.get(deleterId);
                if (Date.now() - lastReport < config.cooldown) {
                    console.log(`[EnglishSelfDeleteReporter] Cooldown active for ${phoneNumber}`);
                    return;
                }
            }
            
            // Create report message
            const reportMessage = generateReportMessage(originalMsg, deleterId);
            
            // Send report to deleter
            if (config.selfReport) {
                await sendToPerson(deleterId, reportMessage);
            }
            
            // Send to admin if configured
            if (config.notifyAdmin && config.adminNumber) {
                const adminReport = generateAdminReport(originalMsg, deleterId);
                await sendToPerson(`${config.adminNumber}@c.us`, adminReport);
            }
            
            // Log the event
            logEvent(originalMsg, deleterId);
            
            // Update cooldown
            cooldownMap.set(deleterId, Date.now());
            
            // Clean cache
            messageCache.delete(deletedMsg.id);
            
        } catch (error) {
            console.error('[EnglishSelfDeleteReporter] Error:', error);
        }
    });
    
    // ===== MESSAGE GENERATION =====
    
    function generateReportMessage(msg, deleterId) {
        const timestamp = new Date().toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        
        const phoneNumber = formatPhoneNumber(deleterId);
        let messageContent = msg.body || msg.caption || '[Media Message]';
        
        // Truncate long messages
        if (messageContent.length > 300) {
            messageContent = messageContent.substring(0, 300) + '...';
        }
        
        return `⚠️ *DELETED MESSAGE DETECTED!*

📞 *Your Number:* ${phoneNumber}
⏰ *Time Deleted:* ${timestamp}
💬 *Chat Type:* ${msg.isGroup ? 'Group Chat' : 'Private Chat'}

🗑️ *Message You Deleted:*
"${messageContent}"

*Note:* This message was automatically sent because you deleted a message.
This bot tracks deleted messages for accountability.`;
    }
    
    function generateAdminReport(msg, deleterId) {
        const timestamp = new Date().toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        
        const phoneNumber = formatPhoneNumber(deleterId);
        let messageContent = msg.body || msg.caption || '[Media Message]';
        
        if (messageContent.length > 200) {
            messageContent = messageContent.substring(0, 200) + '...';
        }
        
        return `👀 *ADMIN ALERT: Message Deleted*
        
📞 *User:* ${phoneNumber}
⏰ *Time:* ${timestamp}
📱 *Chat:* ${msg.isGroup ? 'Group' : 'Private'}

📝 *Deleted Content:*
"${messageContent}"

🔍 *Message Type:* ${msg.type || 'text'}`;
    }
    
    // ===== UTILITY FUNCTIONS =====
    
    function formatPhoneNumber(phone) {
        const num = phone.replace('@c.us', '');
        
        if (num.startsWith('1') && num.length === 12) {
            // US/Canada: 1XXXXXXXXXX
            return `+${num.slice(0,1)} (${num.slice(1,4)}) ${num.slice(4,7)}-${num.slice(7)}`;
        } else if (num.startsWith('94') && num.length === 11) {
            // Sri Lanka: 947XXXXXXXX
            return `+${num.slice(0,2)} ${num.slice(2,4)} ${num.slice(4,7)} ${num.slice(7)}`;
        } else if (num.startsWith('91') && num.length === 12) {
            // India: 91XXXXXXXXXX
            return `+${num.slice(0,2)} ${num.slice(2,7)} ${num.slice(7)}`;
        }
        
        return num;
    }
    
    async function sendToPerson(chatId, message) {
        try {
            await bot.sendMessage(chatId, message);
            console.log(`[EnglishSelfDeleteReporter] Report sent to ${chatId}`);
        } catch (error) {
            console.error(`[EnglishSelfDeleteReporter] Failed to send to ${chatId}:`, error);
        }
    }
    
    function logEvent(msg, deleterId) {
        const logEntry = `
[${new Date().toISOString()}]
User: ${deleterId}
Message: ${msg.body || '[Media]'}
Type: ${msg.type}
Group: ${msg.isGroup ? 'Yes' : 'No'}
------------------------
        `.trim();
        
        // Console log
        if (config.logToConsole) {
            console.log(logEntry);
        }
        
        // File log
        if (config.logToFile) {
            try {
                fs.appendFileSync(logFile, logEntry + '\n\n');
            } catch (error) {
                console.error('[EnglishSelfDeleteReporter] File write error:', error);
            }
        }
    }
    
    // ===== COMMAND HANDLER =====
    
    // Optional: Add command to control the plugin
    bot.on('message', async (msg) => {
        if (msg.body === '!deletetoggle') {
            config.enabled = !config.enabled;
            const status = config.enabled ? 'ENABLED ✅' : 'DISABLED ❌';
            await msg.reply(`Self-Delete Reporter is now ${status}`);
        }
        
        if (msg.body.startsWith('!excludeme')) {
            const userNumber = msg.from.replace('@c.us', '');
            if (!config.excludeNumbers.includes(userNumber)) {
                config.excludeNumbers.push(userNumber);
                await msg.reply(`✅ Your number (${userNumber}) has been added to the exclusion list. You will not receive delete notifications.`);
            } else {
                await msg.reply(`ℹ️ Your number is already in the exclusion list.`);
            }
        }
    });
    
    console.log('[EnglishSelfDeleteReporter] Plugin loaded successfully!');
    console.log('[EnglishSelfDeleteReporter] Tracking deleted messages...');
    
    // Return control functions if needed
    return {
        toggle: () => { config.enabled = !config.enabled; },
        status: () => config.enabled ? 'active' : 'inactive',
        excludeNumber: (number) => {
            const cleanNum = number.replace('+', '').replace(/\s/g, '');
            if (!config.excludeNumbers.includes(cleanNum)) {
                config.excludeNumbers.push(cleanNum);
                return true;
            }
            return false;
        },
        includeNumber: (number) => {
            const cleanNum = number.replace('+', '').replace(/\s/g, '');
            const index = config.excludeNumbers.indexOf(cleanNum);
            if (index > -1) {
                config.excludeNumbers.splice(index, 1);
                return true;
            }
            return false;
        }
    };
};
