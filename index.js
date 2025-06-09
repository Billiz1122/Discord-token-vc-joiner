const axios = require('axios');
const fs = require('fs');
const WebSocket = require('ws');
const config = require('./config.json');

const filepath = './tokens.txt';

function sort(filepath) {
  const fileContent = fs.readFileSync(filepath, 'utf-8');
  return fileContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .sort();
}
async function checkTokens(tokens) {
  const validTokens = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    try {
      const response = await axios.get('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: token }
      });
      console.log(`Token ${i + 1} is valid: ${response.data.username}#${response.data.discriminator}`);
      validTokens.push(token);
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.error(`Token ${i + 1} is invalid`);
      } else {
        console.error(`Error checking token ${i + 1}:`, error.message);
      }
    }
  }
  return validTokens;
}
function ws_joiner(token) {
  const ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json');

  let heartbeatInterval;
  let sequence = null;

  ws.on('open', () => {
    console.log(`WS connected for token: ${token.substring(0, 10)}...`);
  });
  ws.on('message', (data) => {
    const payload = JSON.parse(data);
    const { t, s, op, d } = payload;

    if (s) sequence = s;

    switch (op) {
      case 10: // Hello
        heartbeatInterval = setInterval(() => {
          ws.send(JSON.stringify({ op: 1, d: sequence }));
        }, d.heartbeat_interval);
        // Identify
        ws.send(
          JSON.stringify({
            op: 2,
            d: {
              token: token,
              intents: 0,
              properties: {
                $os: 'linux',
                $browser: 'Firefox',
                $device: 'desktop'
              }
            }
          })
        );
        break;
      case 11: // Heartbeat ACK
        // console.log('Heartbeat ACK received');
        break;
      case 0: // Dispatch
        if (t === 'READY') {
          console.log(`[+] Logged in with token prefix: ${token.substring(0, 8)}...`);
          // Now send voice state update to join VC
          ws.send(
            JSON.stringify({
              op: 4,
              d: {
                guild_id: config.GUILD_ID,
                channel_id: config.VC_CHANNEL,
                self_mute: config.MUTED,
                self_deaf: config.DEAFEN
              }
            })
          );
        }
        else if (t === 'VOICE_SERVER_UPDATE') {
          // Required to start UDP voice connection - advanced
          // You can handle voice server info here
          console.log(`[+] VOICE_SERVER_UPDATE received for token prefix: ${token.substring(0, 8)}...`);
        }
        else if (t === 'VOICE_STATE_UPDATE') {
          console.log(`[+] VOICE_STATE_UPDATE received for token prefix: ${token.substring(0, 8)}...`);
        }
        break;

      case 9: // Invalid session
        console.error('Invalid session. Re-identifying...');
        ws.send(
          JSON.stringify({
            op: 2,
            d: {
              token: token,
              intents: 0,
              properties: {
                $os: 'linux',
                $browser: 'Firefox',
                $device: 'desktop'
              }
            }
          })
        );
        break;
      default:
        break;
    }
  });
  ws.on('close', () => {
    console.log(`[!] WebSocket closed for token prefix: ${token.substring(0, 8)}. Attempting reconnect...`);
    clearInterval(heartbeatInterval);
    setTimeout(() => ws_joiner(token), 5000);
  });
  ws.on('error', (err) => {
    console.error(`[!] WebSocket error for token prefix: ${token.substring(0, 8)}:`, err.message);
  });
}
async function main() {
  const tokens = sort(filepath);
  const validTokens = await checkTokens(tokens);

  validTokens.forEach(token => {
    ws_joiner(token);
  });
}
main();
