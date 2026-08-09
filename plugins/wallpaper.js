const { cmd } = require("../command");
const axios = require("axios");

cmd(
  {
    pattern: "wall",
    alias: ["wallpaper", "wp"],
    react: "🖼️",
    desc: "Download HD Wallpapers",
    category: "download",
    filename: __filename,
  },
  async (conn, mek, m, { from, q, reply }) => {
    try {
      if (!q)
        return reply(
          "*🖼️ Use like this:*\n`.wp car`\n`.wp car 3`\n`.wp anime 5`"
        );

      // keyword + count separate
      const args = q.split(" ");
      let count = parseInt(args[args.length - 1]);

      if (isNaN(count)) {
        count = 1; // default = 1 wallpaper
      } else {
        args.pop(); // remove number from keyword
      }

      if (count > 9) count = 9; // limit
      if (count < 1) count = 1;

      const keyword = args.join(" ");

      reply(`*🔍 Searching ${count} HD wallpaper(s) for:* ${keyword}`);

      const res = await axios.get(
        `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(
          keyword
        )}&sorting=random&resolutions=1920x1080,2560x1440,3840x2160`
      );

      const wallpapers = res.data.data;

      if (!wallpapers || wallpapers.length === 0)
        return reply("*❌ No wallpapers found!*");

      const selected = wallpapers.slice(0, count);

      for (const wp of selected) {
        await conn.sendMessage(
          from,
          {
            image: { url: wp.path },
            caption: `🖼️ *Resolution:* ${wp.resolution}`,
          },
          { quoted: mek }
        );
      }

      reply("*🌟 Done! Enjoy your wallpaper(s).*");
    } catch (e) {
      console.error(e);
      reply("*❌ Error occurred!*");
    }
  }
);
