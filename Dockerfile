FROM node:22-slim

# Puppeteer, Chromium සහ XVFB (Virtual Display) සඳහා අවශ්‍ය සියලුම System Libraries Install කිරීම
RUN apt-get update && apt-get install -y \
    chromium \
    xvfb \
    xauth \
    x11vnc \
    xterm \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-liberation \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Puppeteer එක අලුතෙන් Chromium Download නොකර Linux System Chromium එක භාවිත කිරීමට Set කිරීම
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm install

COPY . .

# Virtual Screen Size එක 1280x720 (Standard Desktop Viewport) ලෙස Set කර Run කිරීම
CMD ["xvfb-run", "--server-args=-screen 0 1280x720x24", "node", "index.js"]
