const { proto, downloadContentFromMessage, getContentType } = require('@whiskeysockets/baileys');

const downloadMediaMessage = async (m) => {
  if (!m) return Buffer.from([]);
  
  let target = m;
  if (target.type === 'viewOnceMessage') {
    target = target.msg;
  }

  const type = target.type || getContentType(target.message || target);
  const msgNode = target.msg || target.message?.[type] || target;

  const typeMap = {
    imageMessage: 'image',
    videoMessage: 'video',
    audioMessage: 'audio',
    stickerMessage: 'sticker',
    documentMessage: 'document',
    image: 'image',
    video: 'video',
    audio: 'audio',
    sticker: 'sticker',
    document: 'document',
  };

  const streamType = typeMap[type] || 'image';

  try {
    const stream = await downloadContentFromMessage(msgNode, streamType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  } catch (err) {
    return Buffer.from([]);
  }
};

const sms = (bot, m) => {
  if (m.key) {
    m.id = m.key.id;
    m.chat = m.key.remoteJid;
    m.fromMe = m.key.fromMe;
    m.isGroup = m.chat.endsWith('@g.us');
    m.sender = m.fromMe
      ? bot.user.id.split(':')[0] + '@s.whatsapp.net'
      : m.isGroup
      ? m.key.participant
      : m.key.remoteJid;
  }
  if (m.message) {
    m.type = getContentType(m.message);
    m.msg =
      m.type === 'viewOnceMessage'
        ? m.message[m.type].message[getContentType(m.message[m.type].message)]
        : m.message[m.type];
    if (m.msg) {
      if (m.type === 'viewOnceMessage') {
        m.msg.type = getContentType(m.message[m.type].message);
      }
      var quotedMention = m.msg.contextInfo != null ? m.msg.contextInfo.participant : '';
      var tagMention = m.msg.contextInfo != null ? m.msg.contextInfo.mentionedJid : [];
      var mention = typeof tagMention == 'string' ? [tagMention] : tagMention;
      mention != undefined ? mention.push(quotedMention) : [];
      m.mentionUser = mention != undefined ? mention.filter((x) => x) : [];
      m.body =
        m.type === 'conversation'
          ? m.msg
          : m.type === 'extendedTextMessage'
          ? m.msg.text
          : m.type == 'imageMessage' && m.msg.caption
          ? m.msg.caption
          : m.type == 'videoMessage' && m.msg.caption
          ? m.msg.caption
          : m.type == 'templateButtonReplyMessage' && m.msg.selectedId
          ? m.msg.selectedId
          : m.type == 'buttonsResponseMessage' && m.msg.selectedButtonId
          ? m.msg.selectedButtonId
          : '';
      m.quoted = m.msg.contextInfo != undefined ? m.msg.contextInfo.quotedMessage : null;
      if (m.quoted) {
        m.quoted.type = getContentType(m.quoted);
        m.quoted.id = m.msg.contextInfo.stanzaId;
        m.quoted.sender = m.msg.contextInfo.participant;
        m.quoted.fromMe = m.quoted.sender.split('@')[0].includes(bot.user.id.split(':')[0]);
        m.quoted.msg =
          m.quoted.type === 'viewOnceMessage'
            ? m.quoted[m.quoted.type].message[getContentType(m.quoted[m.quoted.type].message)]
            : m.quoted[m.quoted.type];
        if (m.quoted.type === 'viewOnceMessage') {
          m.quoted.msg.type = getContentType(m.quoted[m.quoted.type].message);
        }
        var quoted_quotedMention = m.quoted.msg.contextInfo != null ? m.quoted.msg.contextInfo.participant : '';
        var quoted_tagMention = m.quoted.msg.contextInfo != null ? m.quoted.msg.contextInfo.mentionedJid : [];
        var quoted_mention = typeof quoted_tagMention == 'string' ? [quoted_tagMention] : quoted_tagMention;
        quoted_mention != undefined ? quoted_mention.push(quoted_quotedMention) : [];
        m.quoted.mentionUser = quoted_mention != undefined ? quoted_mention.filter((x) => x) : [];
        m.quoted.fakeObj = proto.WebMessageInfo.fromObject({
          key: {
            remoteJid: m.chat,
            fromMe: m.quoted.fromMe,
            id: m.quoted.id,
            participant: m.quoted.sender,
          },
          message: m.quoted,
        });
        m.quoted.download = () => downloadMediaMessage(m.quoted);
        m.quoted.delete = () => bot.sendMessage(m.chat, { delete: m.quoted.fakeObj.key });
        m.quoted.react = (emoji) => bot.sendMessage(m.chat, { react: { text: emoji, key: m.quoted.fakeObj.key } });
      }
    }
    m.download = () => downloadMediaMessage(m);
  }

  m.reply = (teks, id = m.chat, option = { mentions: [m.sender] }) =>
    bot.sendMessage(id, { text: teks, contextInfo: { mentionedJid: option.mentions } }, { quoted: m });
  m.replyS = (stik, id = m.chat, option = { mentions: [m.sender] }) =>
    bot.sendMessage(id, { sticker: stik, contextInfo: { mentionedJid: option.mentions } }, { quoted: m });
  m.replyImg = (img, teks, id = m.chat, option = { mentions: [m.sender] }) =>
    bot.sendMessage(id, { image: img, caption: teks, contextInfo: { mentionedJid: option.mentions } }, { quoted: m });
  m.replyVid = (vid, teks, id = m.chat, option = { mentions: [m.sender], gif: false }) =>
    bot.sendMessage(id, { video: vid, caption: teks, gifPlayback: option.gif, contextInfo: { mentionedJid: option.mentions } }, { quoted: m });
  m.replyAud = (aud, id = m.chat, option = { mentions: [m.sender], ptt: false }) =>
    bot.sendMessage(id, { audio: aud, ptt: option.ptt, mimetype: 'audio/mpeg', contextInfo: { mentionedJid: option.mentions } }, { quoted: m });
  m.replyDoc = (doc, id = m.chat, option = { mentions: [m.sender], filename: 'file.pdf', mimetype: 'application/pdf' }) =>
    bot.sendMessage(id, { document: doc, mimetype: option.mimetype, fileName: option.filename, contextInfo: { mentionedJid: option.mentions } }, { quoted: m });
  m.replyContact = (name, info, number) => {
    var vcard = 'BEGIN:VCARD\n' + 'VERSION:3.0\n' + 'FN:' + name + '\n' + 'ORG:' + info + ';\n' + 'TEL;type=CELL;type=VOICE;waid=' + number + ':+' + number + '\n' + 'END:VCARD';
    bot.sendMessage(m.chat, { contacts: { displayName: name, contacts: [{ vcard }] } }, { quoted: m });
  };
  m.react = (emoji) => bot.sendMessage(m.chat, { react: { text: emoji, key: m.key } });

  return m;
};

module.exports = { sms, downloadMediaMessage };
