FROM node:erbium-buster
# FROM node:12.14.1
MAINTAINER XD(dxd.spirits@gmail.com)

# https://www.npmjs.com/package/keytar
RUN apt-get update && apt-get install -y libsecret-1-dev --no-install-recommends && rm -rf /var/lib/apt/lists/*

RUN mkdir /workspace/ -p
COPY . /workspace/
WORKDIR /workspace/

RUN npm install

CMD npm run node
