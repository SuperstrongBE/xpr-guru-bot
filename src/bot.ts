import { Telegraf, Markup, Context } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { Database } from './interfaces/db_sheme';
import { Session } from './interfaces/session';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN!);

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials in environment variables');
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// Helper function to create or get active session
async function getOrCreateSession(ctx: Context): Promise<Session | null> {
    if (!ctx.from) {
        return null;
    }

    // Check for existing active session
    const { data: existingSession } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', ctx.from.id)
        .eq('status', 'active')
        .single();

    if (existingSession) {
        return existingSession;
    }

    // Create new session
    const newSession = {
        user_id: ctx.from.id,
        telegram_username: ctx.from.username || 'unknown',
        current_step: 1,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const { data: session, error } = await supabase
        .from('sessions')
        .insert([newSession])
        .select()
        .single();

    if (error) {
        console.error('Error creating session:', error);
        return null;
    }

    return session;
}

// Helper function to update session step
async function updateSessionStep(sessionId: string, step: number): Promise<void> {
    await supabase
        .from('sessions')
        .update({ 
            current_step: step,
            updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);
}

// Helper function to complete session
async function completeSession(sessionId: string): Promise<void> {
    await supabase
        .from('sessions')
        .update({ 
            status: 'completed',
            updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);
}

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
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('Sorry, there was an error creating your session. Please try again.');
        return;
    }

    await ctx.reply(
        `Welcome to XPR Guru Bot! 🚀\nSession started (ID: ${session.id})\nUse the buttons below to navigate:`,
        mainMenuKeyboard
    );
});

// Next command
bot.command('next', async (ctx) => {
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('Please start a new session with /start command first.');
        return;
    }

    const nextStep = session.current_step + 1;
    await updateSessionStep(session.id, nextStep);

    await ctx.reply(
        `Moving to step ${nextStep}! 🔄`,
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
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('No active session found. Please start a new session with /start command.');
        return;
    }

    await completeSession(session.id);

    await ctx.reply(
        `Session ${session.id} completed! 🎉\nYou completed ${session.current_step} steps.`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Start Again', 'start_command')]
        ])
    );
});

// Handle keyboard button clicks
bot.hears('🚀 Start', async (ctx) => {
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('Sorry, there was an error creating your session. Please try again.');
        return;
    }

    await ctx.reply(
        `Welcome to XPR Guru Bot! 🚀\nSession started (ID: ${session.id})\nUse the buttons below to navigate:`,
        createInlineKeyboard()
    );
});

bot.hears('⏭️ Next', async (ctx) => {
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('Please start a new session first.');
        return;
    }

    const nextStep = session.current_step + 1;
    await updateSessionStep(session.id, nextStep);

    await ctx.reply(
        `Moving to step ${nextStep}! 🔄`,
        Markup.inlineKeyboard([
            [
                Markup.button.callback('⏭️ Next', 'next_command'),
                Markup.button.callback('🏁 Finish', 'finish_command')
            ]
        ])
    );
});

bot.hears('🏁 Finish', async (ctx) => {
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('No active session found. Please start a new session first.');
        return;
    }

    await completeSession(session.id);

    await ctx.reply(
        `Session ${session.id} completed! 🎉\nYou completed ${session.current_step} steps.`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Start Again', 'start_command')]
        ])
    );
});

// Handle inline button callbacks
bot.action('start_command', async (ctx) => {
    await ctx.answerCbQuery();
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('Sorry, there was an error creating your session. Please try again.');
        return;
    }

    await ctx.reply(
        `Welcome back to XPR Guru Bot! 🚀\nSession started (ID: ${session.id})\nUse the buttons below to navigate:`,
        createInlineKeyboard()
    );
});

bot.action('next_command', async (ctx) => {
    await ctx.answerCbQuery();
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('Please start a new session first.');
        return;
    }

    const nextStep = session.current_step + 1;
    await updateSessionStep(session.id, nextStep);

    await ctx.reply(
        `Moving to step ${nextStep}! 🔄`,
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
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('No active session found. Please start a new session first.');
        return;
    }

    await completeSession(session.id);

    await ctx.reply(
        `Session ${session.id} completed! 🎉\nYou completed ${session.current_step} steps.`,
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