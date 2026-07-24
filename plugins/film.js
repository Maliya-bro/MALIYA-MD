const mime = require('mime-types');  // Make sure to install mime-types package
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const { File } = require('megajs');
const config = require('../config')
const { sinhalaSub } = require("mrnima-moviedl")
const {
  cmd,
  commands
} = require('../command')



cmd({
    pattern: "cines",	
    react: '🔎',
    category: "search",
    desc: "cinesubz moive downloader",
    filename: __filename
},

async function search() {
    const link = `https://cinesubz.co/?s=kgf`;
    try {
        const response = await axios.get(link);
        const $ = cheerio.load(response.data);
        const result = [];

        $("div.module > div.content.rigth.csearch > div > div > article").each((_, element) => {
            result.push({
                title: $(element).find("a").text().replace(/\n/g, '').trim(),
                image: $(element).find("img").attr("src"),
                imdb: $(element).find("div.meta > span.rating").text().trim(),
                year: $(element).find("div.meta > span.year").text().trim(),
                link: $(element).find("div.title > a").attr("href"),
                short_desc: $(element).find("div.contenido > p").text().trim()
            });
        });

        console.log(result);
    } catch (error) {
        console.error("Error fetching search results:", error.message);
    }
})

async function download() {
    const link = "https://cinesubz.co/movies/rasavathi-2024-sinhala-subtitles/";
    try {
        const response = await axios.get(link);
        const $ = cheerio.load(response.data);
        const result = {};

        result.title = $("div.content.right > div.sheader > div.data > h1").text().trim();
        result.image = $("div.content.right > div.sheader > div.poster > img").attr("src");
        result.generose = [];
        $("div.content.right > div.sheader > div.data > div.sgeneros > a").each((_, element) => {
            result.generose.push($(element).text());
        });
        result.date = $("div.content.right > div.sheader > div.data > div.extra > span.date").text();
        result.country = $("div.content.right > div.sheader > div.data > div.extra > span.country").text();
        result.subtitle_author = $("div:nth-child(4) > center > span").text();
        result.imdb = $("#repimdb > strong").text();

        const download_links = [];
        $("#directdownloadlinks > div > div > table > tbody > tr").each((_, element) => {
            download_links.push({
                quality: $(element).find("td > a > strong").text(),
                size: $(element).find("td").eq(1).text(),
                link: $(element).find("td > a").attr("href"),
            });
        });

        result.download_links = await Promise.all(download_links.map(async (i) => ({
            quality: i.quality,
            size: i.size,
            download_link: await get_dl_link(i.link)
        })));

        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("Error fetching movie details:", error.message);
    }
})

async function get_dl_link(apilink) {
    try {
        const res = await axios.get(apilink);
        const $ = cheerio.load(res.data);
        const link = $("#link").attr("href");
        const dl_link = await generateMatchingLinks(link);
        return dl_link;
    } catch (error) {
        console.error("Error fetching download link:", error.message);
        return [];
    }
})



async function get_dl_link(apilink) {
    try {
        const res = await axios.get(apilink);
        const $ = cheerio.load(res.data);

        const link = $("#link").attr("href");
        
  
        var dl_link = await generateMatchingLinks(link);
        
        return dl_link;  
    } catch (error) {
        console.error(`Error fetching download link: ${error.message}`);
        return null; 
    }
})


/*
async (conn, m, mek, { from, q, l, reply }) => {
try{
	//if ( !isDev ) return reply('⚠️ ⚠️ *Contact owner to Active your number To Premium user*')
        if(!q) return await reply('*please give me text !..*')
	var link = `https://cinesubz.co/?s=${q}`
    var response = await axios.get(link);
    var $ = cheerio.load(response.data);
    const result = [];
    $("div.module > div.content.rigth.csearch > div > div > article").each((a, b) => {
        result.push({
            title: $(b).find("a").text().replace(/\n/g, '').trim(),
            image: $(b).find("img").attr("src"),
            imdb: $(b).find("div.meta > span.rating").text().trim(),
            year: $(b).find("div.meta > span.year").text().trim(),
            link: $(b).find("div.title > a").attr("href"),
            short_desc: $(b).find("div.contenido > p").text().trim()
        })
    })
      
        if (result.length < 1) return await conn.sendMessage(from, { text: 'erro !' }, { quoted: mek } )
      let textw = `🔎 𝗧.𝗖 𝗖𝗜𝗡𝗘𝗦𝗨𝗕𝗭 𝗠𝗢𝗩𝗜𝗘 𝗦𝗘𝗔𝗥𝗖𝗛 \n\n`;	
for (var i = 0; i < result.length; i++) {
  textw +=`*📌 Title:* ${result[i].title}\n`	
  textw +=`*📚 CatName:* ${result[i].imdb}\n`
  textw +=`*📅 Date:* ${result[i].year}\n`
  textw +=`*📎 Link:* ${result[i].link}\n`
  textw +=`*📃 Rating:* ${result[i].short_desc}\n\n--------------------------------------------\n\n
`
} 
        
return await conn.sendMessage(config.JID, { image: { url:result[0].image } , caption: textw } , { quoted: mek })
await conn.sendMessage(from, { react: { text: `✅`, key: mek.key }}) 
} catch (e) {
reply()
l(e)
}
})*/   



/*
cmd({
    pattern: "ci",	
    react: '🔎',
    category: "search",
    desc: "cinesubz moive downloader",
    filename: __filename
},
async (conn, m, mek, { from, q, l, reply }) => {
try{
	//if ( !isDev ) return reply('⚠️ ⚠️ *Contact owner to Active your number To Premium user*')
        if(!q) return await reply('*please give me text !..*')
	const url = `https://cineru.lk/?s=${q}`
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        
        let zipLink = null;
        
        if(url.includes('baiscope.lk/')){
            zipLink =  $('a[href*="Downloads"]').attr('href');
        }else if(url.includes('cineru.lk/')){
            zipLink = $('a#btn-download').attr('data-link');
        }else if(url.includes('zoom.lk/')){
            zipLink = $('a.aligncenter.download-button').attr('href');
        }
        
       else{
            zipLink = null;
        }
        
        const info = `⏳ Search A Movie Name: ${q}
${zipLink}
Cinesubz`
        return zipLink;
    return await conn.sendMessage(from, { image: { url:'' } , caption: info } , { quoted: mek })
await conn.sendMessage(from, { react: { text: `✅`, key: mek.key }}) 
} catch (e) {
reply()
l(e)
}
})      
                
                    
cmd({
    pattern: "cine",	
    react: '📑',
    category: "search",
    desc: "cine moive downloader",
    filename: __filename
},
async (conn, m, mek, { from, q, reply }) => {
try{
	//if ( !isDev ) return reply('⚠️ ⚠️ *Contact owner to Active your number To Premium user*')
        if(!q) return await reply('*please give me text !..*')
		var link = `https://cinesubz.co/?s=${q}`
    const response = await axios.get(link);
        const $ = cheerio.load(response.data);
        const result = [];
        $("div.module > div.content.rigth.csearch > div > div > article").each((_, element) => {
            result.push({
                title: $(element).find("a").text().replace(/\n/g, '').trim(),
                image: $(element).find("img").attr("src"),
                imdb: $(element).find("div.meta > span.rating").text().trim(),
                year: $(element).find("div.meta > span.year").text().trim(),
                link: $(element).find("div.title > a").attr("href"),
                short_desc: $(element).find("div.contenido > p").text().trim()
            });
        });
      
        if (result.length < 1) return await conn.sendMessage(from, { text: 'erro !' }, { quoted: mek } )
      	var rows = [];  
for (var i = 0; i < result.length; i++) {
	rows.push({
    
              header: result[i].year,
              title: result[i].title,
              description: result[i].short_desc,
              id: `.dl ${result[i].link}`
            
          });
        }
          
        let buttons = [{
          name: "single_select",
                    buttonParamsJson: JSON.stringify({
                        title: 'Download Moive 📥',
                        sections: [{
                            title: 'Search By sinhalasub',
                            highlight_label: 'T.C MOVIE-DL',
                            rows: rows
                    }]
               }),
          }
      ]
        const info = `⏳ Search A Movie Name: ${q}
📲 Search top 10 Moive\n
Cinesubz`
        let opts = {
                image: result[0].image,
                header: '_*T.C CINESUBZ DL*_',
                footer: 'MOVIE DOWNLOADER BY TC',
                body: info 
            }
            return await conn.sendButtonMessage(from, buttons, m, opts)
        } catch (e) {
            reply('*Error !!*')
            console.log(e)
            }
    })
                        
cmd({
    pattern: "dl",	
    react: '📑',
    category: "search",
    desc: "sinhalasub moive downloader",
    filename: __filename
},
    async ( conn, mek, m, { reply, q, l, from }) => {
	 //if ( !isDev ) return reply('⚠️ ⚠️ *Contact owner to Active your number To Premium user*')   
	    try {
		    if (!q) return await reply("please give me text !..")
async function get_dl_link(apilink) {
    try {
        const res = await axios.get(apilink);
        const $ = cheerio.load(res.data);
        const link = $("#link").attr("href");
        const dl_link = await generateMatchingLinks(link);
        return dl_link;
    } catch (error) {
        console.error("Error fetching download link:", error.message);
        return [];
    }
}
		    
  const link = `${q}`;
        const response = await axios.get(link);
        const $ = cheerio.load(response.data);
        const result = {};
        result.title = $("div.content.right > div.sheader > div.data > h1").text().trim();
        result.image = $("div.content.right > div.sheader > div.poster > img").attr("src");
        result.generose = [];
        $("div.content.right > div.sheader > div.data > div.sgeneros > a").each((_, element) => {
            result.generose.push($(element).text());
        });
        result.date = $("div.content.right > div.sheader > div.data > div.extra > span.date").text();
        result.country = $("div.content.right > div.sheader > div.data > div.extra > span.country").text();
        result.subtitle_author = $("div:nth-child(4) > center > span").text();
        result.imdb = $("#repimdb > strong").text();
		    
                      const msg = `📃 𝗦𝗨𝗕𝗦 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥\n\n
📃 *Title:* ${result.title}\n
🔗 *Link:* ${result.generose}\n
📅 *Year:* ${result.date}\n
💫 *Size:* ${result.country}\n
🍒  *Size:* ${result.imdb}\n
⏳ *Views:* ${result.subtitle_author}\n`
                let buttons = [{
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: 'Watch on ZOOM',
                        url: q,
                        merchant_url: q
                    }),
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: `CLICK TO DOWN SUB`,
                        id: `.cidls ` + q
                    }),
                }
                ]
                let message = {
                    image: result.image,
                    header: '🎬━_*T.C ZOOM DL*_━🎬',
                    footer: 'MOVIE DOWNLOADER BY TC',
                    body: msg
                }
                return conn.sendButtonMessage(from, buttons, m, message)
	        } catch (error) {
        console.error("Error fetching movie details:", error.message);
    }
    })
	
   
//------------------------dl---------------
cmd({
pattern: "cidls",
react: '📑',
category: "search",
desc: "cine movie downloader",
filename: __filename
},
async (conn, m, mek, { from, q, reply }) => {
    try {
       
        //if (!isDev) return reply('⚠️ ⚠️ *Contact owner to activate your number as a Premium user*');
        
       
        if (!q) return await reply('*Please provide a movie name!*');
        
      async function get_dl_link(apilink) {
    try {
        const res = await axios.get(apilink);
        const $ = cheerio.load(res.data);
        const link = $("#link").attr("href");
        const dl_link = await generateMatchingLinks(link);
        return dl_link;
    } catch (error) {
        console.error("Error fetching download link:", error.message);
        return [];
    }
      }
        var response = await axios.get(`${q}`);
        var $ = cheerio.load(response.data);
        
        
const result = {};
        const download_links = [];
        $("#directdownloadlinks > div > div > table > tbody > tr").each((_, element) => {
            download_links.push({
                quality: $(element).find("td > a > strong").text(),
                size: $(element).find("td").eq(1).text(),
                link: $(element).find("td > a").attr("href"),
            });
        });
        result.download_links = await Promise.all(download_links.map(async (i) => ({
            quality: i.quality,
            size: i.size,
            download_link: await get_dl_link(i.link)
        })));
        console.log(JSON.stringify(result, null, 2));
	    
	    const cap = `${result.download_links.download_link}`
        
if (download_links.length < 1) return await conn.sendMessage(from, { text: 'erro !' }, { quoted: mek } )
      
       
        var rows = [];
        for (let movie of download_links) {
            for (let link of movie.download_links) {
                rows.push({
                    header: `${download_links[1].quality}`,
                    title: '',
                    description: link.size,
                    id: `.fetch ${result.download_links[1].link}`
                });
            }
        }
        const mediaMessage = [{
            name: "single_select",
            buttonParamsJson: JSON.stringify({
                title: 'Download Movie 📥',
                sections: [{
                    title: 'Search By Sinhalasub',
                    highlight_label: 'T.C MOVIE-DL',
                    rows: rows
                }]
            }),
        }];
        
        const info = `⏳ Movie Search: ${q}\n📲 Top 10 Movies from Cinesubz\n`;
        let opts = {
            image: '',  // Add image URL if necessary
            header: '_*T.C CINESUBZ DL*_',
            footer: 'MOVIE DOWNLOADER BY TC',
            body: cap
        };
       
        return await conn.sendButtonMessage(from, buttons, m, opts);
    } catch (e) {
        
        reply('*Error occurred!*');
        console.error(e); 
    }
});*/




const app = express();
const PORT = process.env.PORT || 3000;


app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});


function formatRuntime(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}min`;
}

app.get('/scrape-movies', async (req, res) => {
  try {
    const { url } = req.query; 
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const response = await axios.get(url);
    if (response.status === 200) {
      const $ = cheerio.load(response.data);
      const movies = [];

     
      $('.movie-container').each((index, element) => {
        const title = $(element).find('.movie-title').text().trim();  
        const rating = $(element).find('.movie-rating').text().trim();  
        const runtimeText = $(element).find('.movie-runtime').text().trim();  
        const runtimeInMinutes = parseInt(runtimeText.match(/\d+/)[0]);  
        const runtime = formatRuntime(runtimeInMinutes);  

        const qualities = [];
        
        $(element).find('.download-quality a').each((i, el) => {
          const quality = $(el).text().trim();
          const downloadLink = $(el).attr('href');  // Get download URL
          qualities.push({ quality, downloadLink });
        });

        
        movies.push({
          title,
          rating,
          runtime,
          downloadQualities: qualities,
        });
      });

    
      res.json({ movies });
    } else {
      throw new Error('Failed to fetch data from the website');
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
/*
cmd({
    pattern: "test",	
    react: '🔎',
    category: "search",
    desc: "cinesubz moive downloader",
    filename: __filename
},
async (conn, m, mek, { from, q, isDev, l, reply }) => {
try{
	//if ( !isDev ) return reply('⚠️ ⚠️ *Contact owner to Active your number To Premium user*')
        if(!q) return await reply('*please give me text !..*')
	var url = `https://cinesubz.co/?s=${q}`
    const response = await axios.get(url);
    //if (response.status === 200) {
      const $ = cheerio.load(response.data);
      const movies = [];
     
      $('.movie-container').each((index, element) => {
        const title = $(element).find('.movie-title').text().trim();  
        const rating = $(element).find('.movie-rating').text().trim();  
        const runtimeText = $(element).find('.movie-runtime').text().trim();  
        const runtimeInMinutes = parseInt(runtimeText.match(/\d+/)[0]);  
        const runtime = formatRuntime(runtimeInMinutes);  
        const qualities = [];
        
        $(element).find('.download-quality a').each((i, el) => {
          const quality = $(el).text().trim();
          const downloadLink = $(el).attr('href');  // Get download URL
          qualities.push({ quality, downloadLink });
        });
        
        movies.push({
          title,
          rating,
          runtime,
          downloadQualities: qualities,
        });
      });
    
      
        if (movies.length < 1) return await conn.sendMessage(from, { text: 'erro !' }, { quoted: mek } )
      let textw = `🔎 𝗧.𝗖 𝗖𝗜𝗡𝗘𝗦𝗨𝗕𝗭 𝗠𝗢𝗩𝗜𝗘 𝗦𝗘𝗔𝗥𝗖𝗛 \n\n`;	
for (var i = 0; i < movies.length; i++) {
  textw +=`*📌 Title:* ${movies[i].title}\n`	
  textw +=`*📚 CatName:* ${movies[i].rating}\n`
  textw +=`*📅 Date:* ${movies[i].runtimeText}\n`
  textw +=`*📎 Link:* ${movies[i].runtime}\n`
  textw +=`*📃 Rating:* ${movies[i].runtimeInMinutes}\n\n--------------------------------------------\n\n
`
} 
        
return await conn.sendMessage(config.JID, { image: { url:'' } , caption: textw } , { quoted: mek })
await conn.sendMessage(from, { react: { text: `✅`, key: mek.key }}) 
} catch (e) {
reply()
l(e)
}
})      
    
*/
