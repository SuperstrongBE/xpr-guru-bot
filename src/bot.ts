import { Telegraf, Markup, Context } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { Database } from './interfaces/db_sheme';
import { Session } from './interfaces/session';

// Define Question type based on the database schema
type Question = Database['public']['Tables']['questions']['Row'];

// Store current question for each session ID
const activeQuestions = new Map<string, Question>();

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN!);

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials in environment variables');
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// Helper function to fetch a random question
async function getRandomQuestion(): Promise<Question | null> {
    const { data: questions, error } = await supabase
        .from('questions')
        .select('*');

    if (error || !questions || questions.length === 0) {
        console.error('Error fetching questions:', error);
        return null;
    }

    const randomIndex = Math.floor(Math.random() * questions.length);
    return questions[randomIndex];
}

// Helper function to create inline keyboard from choices
function createChoicesKeyboard(choices: string[]) {
    return Markup.inlineKeyboard(
        choices.map(choice => [
            Markup.button.callback(choice, `answer:${choice}`)
        ])
    );
}

// Helper function to update session score
async function updateSessionScore(sessionId: string, isCorrect: boolean): Promise<void> {
    const { data: session } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

    if (session) {
        const questions = (session.questions || 0) + 1;
        const correct = (session.correct || 0) + (isCorrect ? 1 : 0);

        await supabase
            .from('sessions')
            .update({ 
                questions,
                correct
            })
            .eq('id', sessionId);
    }
}

// Helper function to create or get active session
async function getOrCreateSession(ctx: Context): Promise<Session | null> {
    if (!ctx.from) {
        return null;
    }

    // Check for existing active session
    const { data: existingSession } = await supabase
        .from('sessions')
        .select('*')
        .eq('tg_handle', ctx.from.id.toString())
        .order('created_date', { ascending: false })
        .limit(1)
        .single();

    if (existingSession && existingSession.questions !== null) {
        // Create new session if the last one has questions (was used)
        const newSession = {
            tg_id: ctx.from.id.toString(),
            tg_handle: ctx.from.username || 'unknown',
            created_date: new Date().toISOString(),
            questions: 0,
            correct: 0
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

    if (existingSession) {
        return existingSession;
    }

    // Create new session if none exists
    const newSession = {
        tg_id: ctx.from.id.toString(),
        tg_handle: ctx.from.username || 'unknown',
        created_date: new Date().toISOString(),
        questions: 0,
        correct: 0,
        
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

// Helper function to update session progress
async function updateSessionProgress(sessionId: string, questions: number, correct: number): Promise<void> {
    await supabase
        .from('sessions')
        .update({ 
            questions,
            correct
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

    const question = await getRandomQuestion();
    if (!question || !question.choices) {
        await ctx.reply('Sorry, there was an error fetching a question. Please try again.');
        return;
    }

    // Store the current question
    activeQuestions.set(session.id, question);

    await ctx.reply(
        `Welcome to XPR Guru Bot! 🚀\nSession ID: ${session.id}\n\n❓ ${question.question}`,
        createChoicesKeyboard(question.choices)
    );
});

// Handle answer callbacks
bot.action(/^answer:(.+)$/, async (ctx) => {
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('Session error. Please start a new session.');
        return;
    }

    const userAnswer = ctx.match[1];
    const question = activeQuestions.get(session.id);
    
    console.log('Active questions:', Array.from(activeQuestions.entries()));
    console.log('Current session ID:', session.id);
    console.log('Current question:', question);

    if (!question) {
        const newQuestion = await getRandomQuestion();
        if (!newQuestion || !newQuestion.choices) {
            await ctx.reply('Error getting a new question. Please try /start again.');
            return;
        }
        activeQuestions.set(session.id, newQuestion);
        
        await ctx.reply(
            `Here's a new question:\n\n❓ ${newQuestion.question}`,
            createChoicesKeyboard(newQuestion.choices)
        );
        return;
    }

    const isCorrect = userAnswer === question.answer;
    await updateSessionScore(session.id, isCorrect);
    
    // Get fresh session data
    const { data: updatedSession } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', session.id)
        .single();

    if (!updatedSession) {
        await ctx.reply('Error retrieving session data. Please try again.');
        return;
    }

    // Send immediate feedback in the popup
    await ctx.answerCbQuery(isCorrect ? '✅ Correct!' : '❌ Wrong!');
    
    console.log('Current question:', question);
    console.log('User answer:', userAnswer);
    console.log('Session:', updatedSession);

    // Build the feedback message
    const messageParts = [
        isCorrect ? '✅ Correct!' : '❌ Wrong!',
        '',
        `📝 Question: ${question.question}`,
        `🤔 Your answer: ${userAnswer}`,
        `✨ Correct answer: ${question.answer}`
    ];

    // Add explanation if available
    if (question.answer_info) {
        messageParts.push('', `ℹ️ Explanation: ${question.answer_info}`);
    }

    // Add score
    messageParts.push('', `📊 Score: ${updatedSession.correct}/${updatedSession.questions} correct`);

    // Join all parts with newlines
    const feedbackMessage = messageParts.join('\n');

    console.log('Feedback message:', feedbackMessage);

    // Get next question ready
    const nextQuestion = await getRandomQuestion();
    if (nextQuestion && nextQuestion.choices) {
        activeQuestions.set(session.id, nextQuestion);
    }

    await ctx.reply(
        feedbackMessage,
        Markup.inlineKeyboard([
            [Markup.button.callback('Next Question ⏭️', 'next_command')]
        ])
    );
});

// Next command
bot.command('next', async (ctx) => {
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('Please start a new session with /start command first.');
        return;
    }

    const currentQuestions = session.questions || 0;
    const currentCorrect = session.correct || 0;
    await updateSessionProgress(session.id, currentQuestions + 1, currentCorrect);

    await ctx.reply(
        `Question ${(currentQuestions + 1)}! 🔄\nCorrect answers: ${currentCorrect}`,
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

    const questions = session.questions || 0;
    const correct = session.correct || 0;
    const accuracy = questions > 0 ? Math.round((correct / questions) * 100) : 0;

    await ctx.reply(
        `Session completed! 🎉\nQuestions answered: ${questions}\nCorrect answers: ${correct}\nAccuracy: ${accuracy}%`,
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
        `Welcome to XPR Guru Bot! 🚀\nNew session started (ID: ${session.id})\nUse the buttons below to navigate:`,
        createInlineKeyboard()
    );
});

bot.hears('⏭️ Next', async (ctx) => {
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('Please start a new session first.');
        return;
    }

    const currentQuestions = session.questions || 0;
    const currentCorrect = session.correct || 0;
    await updateSessionProgress(session.id, currentQuestions + 1, currentCorrect);

    await ctx.reply(
        `Question ${(currentQuestions + 1)}! 🔄\nCorrect answers: ${currentCorrect}`,
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

    const questions = session.questions || 0;
    const correct = session.correct || 0;
    const accuracy = questions > 0 ? Math.round((correct / questions) * 100) : 0;

    await ctx.reply(
        `Session completed! 🎉\nQuestions answered: ${questions}\nCorrect answers: ${correct}\nAccuracy: ${accuracy}%`,
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
        `Welcome back to XPR Guru Bot! 🚀\nNew session started (ID: ${session.id})\nUse the buttons below to navigate:`,
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

    // Get fresh session data
    const { data: freshSession } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', session.id)
        .single();

    if (!freshSession) {
        await ctx.reply('Error retrieving session data. Please try again.');
        return;
    }

    // Get the prepared question or fetch a new one
    let question = activeQuestions.get(session.id);
    if (!question) {
        question = await getRandomQuestion();
        if (!question || !question.choices) {
            await ctx.reply('Sorry, there was an error fetching a question. Please try again.');
            return;
        }
        activeQuestions.set(session.id, question);
    }

    const questionNumber = (freshSession.questions || 0) + 1;
    const stats = `Question ${questionNumber}! 🔄\nScore so far: ${freshSession.correct || 0}/${freshSession.questions || 0} correct`;

    await ctx.reply(
        `${stats}\n\n❓ ${question.question}`,
        createChoicesKeyboard(question.choices)
    );
});

bot.action('finish_command', async (ctx) => {
    await ctx.answerCbQuery();
    const session = await getOrCreateSession(ctx);
    if (!session) {
        await ctx.reply('No active session found. Please start a new session first.');
        return;
    }

    const questions = session.questions || 0;
    const correct = session.correct || 0;
    const accuracy = questions > 0 ? Math.round((correct / questions) * 100) : 0;

    await ctx.reply(
        `Session completed! 🎉\nQuestions answered: ${questions}\nCorrect answers: ${correct}\nAccuracy: ${accuracy}%`,
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