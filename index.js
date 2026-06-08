import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Events } from 'discord.js';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Error: DISCORD_TOKEN belum diset di .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, () => {
  console.log(`Bot online sebagai ${client.user.tag}`);
});

client.on(Events.MessageCreate, message => {
  // Skip bot messages
  if (message.author.bot) return;
  
  console.log(`Message dari ${message.author.tag}: "${message.content}"`);
  
  // Simple command check
  if (message.content.toLowerCase() === 'ping') {
    message.reply('Pong!');
  }
  
  if (message.content.toLowerCase() === '!ping') {
    message.reply('Pong! (prefix test)');
  }
  
  if (message.content.toLowerCase().startsWith('/ping')) {
    message.reply('Pong! (slash test)');
  }
});

client.login(token).catch(error => {
  console.error('Gagal login:', error);
});
