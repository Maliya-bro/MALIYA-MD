const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

class ViewOnceHandler {
    constructor() {
        this.tempDir = './temp_viewonce';
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async extractViewOnceMedia(sock, quotedMsg) {
        try {
            let mediaMessage = null;
            let mediaType = '';
            
            // Check for different types of view once messages
            if (quotedMsg?.ephemeralMessage?.message) {
                mediaMessage = quotedMsg.ephemeralMessage.message;
            } else if (quotedMsg?.viewOnceMessage?.message) {
                mediaMessage = quotedMsg.viewOnceMessage.message;
            } else if (quotedMsg?.viewOnceMessageV2?.message) {
                mediaMessage = quotedMsg.viewOnceMessageV2.message;
            }

            if (!mediaMessage) {
                return { success: false, error: "No view once media found" };
            }

            // Determine media type
            if (mediaMessage.imageMessage) {
                mediaType = 'image';
            } else if (mediaMessage.videoMessage) {
                mediaType = 'video';
            } else if (mediaMessage.audioMessage) {
                mediaType = 'audio';
            } else if (mediaMessage.documentMessage) {
                mediaType = 'document';
            } else if (mediaMessage.stickerMessage) {
                mediaType = 'sticker';
            } else {
                return { success: false, error: "Unsupported media type" };
            }

            // Download media
            const buffer = await downloadMediaMessage(
                { message: { [mediaType + 'Message']: mediaMessage[mediaType + 'Message'] } },
                'buffer',
                {},
                { reuploadRequest: sock.updateMediaMessage }
            );

            if (!buffer) {
                return { success: false, error: "Failed to download media" };
            }

            const tempId = Date.now();
            const fileExt = this.getFileExtension(mediaType, mediaMessage[mediaType + 'Message']?.mimetype);
            const fileName = `${mediaType}_${tempId}.${fileExt}`;
            const filePath = path.join(this.tempDir, fileName);
            
            fs.writeFileSync(filePath, buffer);

            return {
                success: true,
                mediaType: mediaType,
                filePath: filePath,
                buffer: buffer,
                caption: mediaMessage[mediaType + 'Message']?.caption || '',
                mimetype: mediaMessage[mediaType + 'Message']?.mimetype || this.getMimeType(mediaType)
            };

        } catch (error) {
            console.error('Error extracting view once media:', error);
            return { success: false, error: error.message };
        }
    }

    getFileExtension(mediaType, mimetype) {
        const extensions = {
            'image': mimetype?.includes('png') ? 'png' : 
                     mimetype?.includes('webp') ? 'webp' : 
                     mimetype?.includes('gif') ? 'gif' : 'jpg',
            'video': mimetype?.includes('gif') ? 'gif' : 'mp4',
            'audio': 'ogg',
            'document': mimetype?.includes('pdf') ? 'pdf' : 
                       mimetype?.includes('doc') ? 'doc' : 'bin',
            'sticker': 'webp'
        };
        
        return extensions[mediaType] || 'bin';
    }

    getMimeType(mediaType) {
        const mimeTypes = {
            'image': 'image/jpeg',
            'video': 'video/mp4',
            'audio': 'audio/ogg',
            'document': 'application/octet-stream',
            'sticker': 'image/webp'
        };
        
        return mimeTypes[mediaType] || 'application/octet-stream';
    }

    cleanupTempFiles() {
        // Clean files older than 1 hour
        const files = fs.readdirSync(this.tempDir);
        const now = Date.now();
        
        files.forEach(file => {
            const filePath = path.join(this.tempDir, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > 3600000) { // 1 hour
                fs.unlinkSync(filePath);
            }
        });
    }
}

module.exports = ViewOnceHandler;
