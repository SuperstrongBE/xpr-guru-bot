import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN!);

// Start command
bot.command('start', async (ctx) => {
    await ctx.reply('Welcome to XPR Guru Bot! 🚀\nUse /next to proceed or /finish to complete.');
});

// Next command
bot.command('next', async (ctx) => {
    await ctx.reply('Moving to the next step! 🔄\nUse /finish when you\'re done.');
});

// Finish command
bot.command('finish', async (ctx) => {
    await ctx.reply('Thank you for using XPR Guru Bot! 🎉\nUse /start to begin again.');
});

// Error handler
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
});

// Start the bot
bot.launch()
    .then(() => {
        console.log('Bot is running! 🚀');
    })
    .catch((err) => {
        console.error('Failed to start bot:', err);
    });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));