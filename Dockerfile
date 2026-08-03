FROM node:18-slim

# Linux වලට අවශ්‍ය වන GUI Emulation (xvfb) සහ Chromium Dependencies ඉන්ස්ටෝල් කිරීම
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    xterm \
    chromium \
    libgconf-2-4 \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Railway එකේ Xvfb (Virtual Screen) එකක් ඇතුලේ බොට්ව headless: false විදිහටම රන් කරවන්න මේ Command එක දෙන්න
CMD ["xvfb-run", "--server-args=-screen 0 1024x768x24", "node", "index.js"]
