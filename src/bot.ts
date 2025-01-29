import { Telegraf, Markup } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { Database } from './interfaces/db_sheme';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN!);

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials in environment variables');
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// Keyboard markup for main menu
const mainMenuKeyboard = Markup.keyboard([
    ['🚀 Start', '⏭️ Next', '🏁 Finish']
]).resize();

// Helper function to create inline keyboard
const createInlineKeyboard = () => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('⏭️ Next', 'next_command'),
            Markup.button.callback('🏁 Finish', 'finish_command')
        ]
    ]);
};

// Start command
bot.command('start', async (ctx) => {
    await ctx.reply(
        'Welcome to XPR Guru Bot! 🚀\nUse the buttons below to navigate:',
        mainMenuKeyboard
    );
});

// Next command
bot.command('next', async (ctx) => {
    await ctx.reply(
        'Moving to the next step! 🔄',
        Markup.inlineKeyboard([
            [
                Markup.button.callback('⏭️ Next', 'next_command'),
                Markup.button.callback('🏁 Finish', 'finish_command')
            ]
        ])
    );
});

// Finish command
bot.command('finish', async (ctx) => {
    await ctx.reply(
        'Thank you for using XPR Guru Bot! 🎉',
        Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Start Again', 'start_command')]
        ])
    );
});

// Handle keyboard button clicks
bot.hears('🚀 Start', async (ctx) => {
    await ctx.reply(
        'Welcome to XPR Guru Bot! 🚀\nUse the buttons below to navigate:',
        createInlineKeyboard()
    );
});

bot.hears('⏭️ Next', async (ctx) => {
    await ctx.reply(
        'Moving to the next step! 🔄',
        Markup.inlineKeyboard([
            [
                Markup.button.callback('⏭️ Next', 'next_command'),
                Markup.button.callback('🏁 Finish', 'finish_command')
            ]
        ])
    );
});

bot.hears('🏁 Finish', async (ctx) => {
    await ctx.reply(
        'Thank you for using XPR Guru Bot! 🎉',
        Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Start Again', 'start_command')]
        ])
    );
});

// Handle inline button callbacks
bot.action('start_command', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        'Welcome back to XPR Guru Bot! 🚀\nUse the buttons below to navigate:',
        createInlineKeyboard()
    );
});

bot.action('next_command', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        'Moving to the next step! 🔄',
        Markup.inlineKeyboard([
            [
                Markup.button.callback('⏭️ Next', 'next_command'),
                Markup.button.callback('🏁 Finish', 'finish_command')
            ]
        ])
    );
});

bot.action('finish_command', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        'Thank you for using XPR Guru Bot! 🎉',
        Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Start Again', 'start_command')]
        ])
    );
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