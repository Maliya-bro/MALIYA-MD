FROM node:22-slim
RUN apt-get update && apt-get install -y \
    git \
    ca-certificates \
    openssh-client \
    xvfb \
    xauth \
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
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN rm -f package-lock.json && \
    git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
    npm install --no-package-lock
COPY . .
CMD ["xvfb-run", "--server-args=-screen 0 1024x768x24", "node", "index.js"]
