const { cmd } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

cmd({
    pattern: "aimg",
    alias: ["quzimg", "genimg", "teaimg", "aiimage"],
    react: "🎨",
    desc: "Generate AI images from text (100% Free)",
    category: "ai",
    filename: __filename,
},
async (bot, mek, m, { from, q, reply }) => {
    try {
        if (!q) {
            return reply("🎨 *Please describe your image*\n\nExample: .aimg beautiful sunset");
        }

        await bot.sendMessage(from, {
            text: `🎨 *Generating your AI image...*\n\n📝 *Prompt:* ${q}\n⏳ Please wait...`
        }, { quoted: mek });

        // ============ METHOD 1: Prodia API ============
        try {
            const prodiaUrl = `https://api.prodia.com/generate?prompt=${encodeURIComponent(q)}&model=3Guofeng3_v31.safetensors&steps=20&cfg=7&sampler=DPM%2B%2B%202M%20Karras&aspect_ratio=square`;
            
            const prodiaRes = await axios.get(prodiaUrl, {
                headers: {
                    'accept': 'application/json'
                },
                timeout: 30000
            });

            if (prodiaRes.data && prodiaRes.data.imageUrl) {
                const imageUrl = prodiaRes.data.imageUrl;
                const imagePath = path.join(__dirname, `${Date.now()}_ai.jpg`);
                
                const imgRes = await axios({
                    url: imageUrl,
                    method: 'GET',
                    responseType: 'arraybuffer'
                });
                
                await bot.sendMessage(from, {
                    image: Buffer.from(imgRes.data),
                    caption: `🎨 *AI Image Generated*\n\n📝 *Prompt:* ${q}\n\n✨ Powered by Prodia AI\n✅ 100% Free\n\n> MALIYA-MD ❤️`
                }, { quoted: mek });
                
                return;
            }
        } catch (e) {
            console.log("Prodia failed:", e.message);
        }

        // ============ METHOD 2: Stable Diffusion API ============
        try {
            const sdUrl = `https://api.visioncraft.one/stable-diffusion?prompt=${encodeURIComponent(q)}&model=sdv1_5`;
            
            const sdRes = await axios.get(sdUrl, {
                responseType: 'arraybuffer',
                timeout: 45000
            });

            if (sdRes.data) {
                await bot.sendMessage(from, {
                    image: Buffer.from(sdRes.data),
                    caption: `🎨 *AI Image Generated*\n\n📝 *Prompt:* ${q}\n\n✨ Powered by Stable Diffusion\n✅ 100% Free\n\n> MALIYA-MD ❤️`
                }, { quoted: mek });
                
                return;
            }
        } catch (e) {
            console.log("Stable Diffusion failed:", e.message);
        }

        // ============ METHOD 3: Lexica API ============
        try {
            const lexicaUrl = `https://lexica.art/api/v1/search?q=${encodeURIComponent(q)}`;
            
            const lexicaRes = await axios.get(lexicaUrl);
            
            if (lexicaRes.data && lexicaRes.data.images && lexicaRes.data.images.length > 0) {
                const imageUrl = lexicaRes.data.images[0].src;
                
                const imgRes = await axios({
                    url: imageUrl,
                    method: 'GET',
                    responseType: 'arraybuffer'
                });
                
                await bot.sendMessage(from, {
                    image: Buffer.from(imgRes.data),
                    caption: `🎨 *AI Image Generated*\n\n📝 *Prompt:* ${q}\n\n✨ Powered by Lexica AI\n✅ 100% Free\n\n> MALIYA-MD ❤️`
                }, { quoted: mek });
                
                return;
            }
        } catch (e) {
            console.log("Lexica failed:", e.message);
        }

        // ============ METHOD 4: Playground API ============
        try {
            const playUrl = `https://playgroundai.com/api/trpc/generate.createTask?batch=1`;
            
            const playRes = await axios.post(playUrl, {
                "0": {
                    "json": {
                        "prompt": q,
                        "negativePrompt": "",
                        "width": 1024,
                        "height": 1024,
                        "model": "playground-v2.5"
                    }
                }
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (playRes.data && playRes.data[0] && playRes.data[0].result && playRes.data[0].result.data && playRes.data[0].result.data.json) {
                const taskId = playRes.data[0].result.data.json.taskId;
                
                // Wait for generation
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const resultUrl = `https://playgroundai.com/api/trpc/generate.getTask?batch=1&input=${encodeURIComponent('{"0":{"json":{"taskId":"' + taskId + '"}}}')}`;
                
                const resultRes = await axios.get(resultUrl);
                
                if (resultRes.data && resultRes.data[0] && resultRes.data[0].result && resultRes.data[0].result.data && resultRes.data[0].result.data.json && resultRes.data[0].result.data.json.images) {
                    const imageUrl = resultRes.data[0].result.data.json.images[0].url;
                    
                    const imgRes = await axios({
                        url: imageUrl,
                        method: 'GET',
                        responseType: 'arraybuffer'
                    });
                    
                    await bot.sendMessage(from, {
                        image: Buffer.from(imgRes.data),
                        caption: `🎨 *AI Image Generated*\n\n📝 *Prompt:* ${q}\n\n✨ Powered by Playground AI\n✅ 100% Free\n\n> MALIYA-MD ❤️`
                    }, { quoted: mek });
                    
                    return;
                }
            }
        } catch (e) {
            console.log("Playground failed:", e.message);
        }

        // ============ ALL METHODS FAILED ============
        reply("❌ All AI image generators are currently busy. Please try again in a few minutes.\n\nTry these commands instead:\n.imagine cat\n.dream beautiful girl\n.gen sunset");
        
    } catch (e) {
        console.log("AI Image Main Error:", e);
        reply("❌ Error generating image. Please try again later.");
    }
});

// ============ BACKUP COMMAND ============
cmd({
    pattern: "imagine",
    alias: ["dream", "gen"],
    category: "ai",
},
async (bot, mek, m, { from, q, reply }) => {
    if (!q) return reply("Send your image description");
    
    try {
        await bot.sendMessage(from, {
            text: `🎨 *Generating...*\n📝 ${q}`
        }, { quoted: mek });
        
        // Pollinations AI (most reliable)
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=1024&height=1024&nologo=true`;
        
        const res = await axios({
            url: url,
            method: 'GET',
            responseType: 'arraybuffer',
            timeout: 30000
        });
        
        await bot.sendMessage(from, {
            image: Buffer.from(res.data),
            caption: `🎨 *${q}*\n\n✨ Generated by Pollinations AI`
        }, { quoted: mek });
        
    } catch (e) {
        reply("❌ Failed. Try .aimg command");
    }
});
