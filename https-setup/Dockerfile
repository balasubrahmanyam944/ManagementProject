# Use official Node.js slim image
FROM node:20-slim

# Prevent warnings from apt about interactive mode
ENV DEBIAN_FRONTEND=noninteractive

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install build tools
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 🔐 Dev-only: Bypass self-signed certificate errors
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# Install dependencies
RUN npm install

# Copy all local files
COPY . .

# Copy mkcert binary
COPY https-setup/mkcert-v1.4.4-linux-amd64 /usr/local/bin/mkcert
RUN chmod +x /usr/local/bin/mkcert

# 👇 Configure mkcert to use a predictable location & generate CA
# Run mkcert -install as root, ensure dir exists
RUN mkdir -p /root/.local/share/mkcert && \
    mkcert -install

# 🔁 Copy the generated rootCA.pem from mkcert to system
# The CA should now be at: /root/.local/share/mkcert/rootCA.pem
RUN cp /root/.local/share/mkcert/rootCA.pem /usr/local/share/ca-certificates/rootCA.crt && \
    update-ca-certificates

# Tell Node.js to trust the CA
ENV NODE_EXTRA_CA_CERTS=/root/.local/share/mkcert/rootCA.pem

# Copy your pre-generated dev certs (optional, if using localhost+4.pem)
COPY https-setup/localhost+4.pem /app/https-setup/localhost+4.pem
COPY https-setup/localhost+4-key.pem /app/https-setup/localhost+4-key.pem

# Expose port
EXPOSE 9003

# Start dev server
CMD ["npm", "run", "dev"]