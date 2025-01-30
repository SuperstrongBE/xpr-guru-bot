import { Telegraf, Markup, Context, session } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { Database } from './interfaces/db_sheme';
import { Session } from './interfaces/session';

// Define session context
interface SessionContext extends Context {
    session?: {
        sessionId?: string;
    };
}

// Define Question type based on the database schema
type Question = Database['public']['Tables']['questions']['Row'];

// Define types
type SessionMode = Database['public']['Enums']['session_mode'];

dotenv.config();

const bot = new Telegraf<SessionContext>(process.env.BOT_TOKEN!);
bot.use(session());

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials in environment variables');
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// Helper function to fetch a random question
async function getRandomQuestion(mode: SessionMode): Promise<Question | undefined> {
    const query = supabase
        .from('questions')
        .select('*');

    // Filter questions based on mode
    if (mode !== 'mixed') {
        query.contains('tags', [mode]);
    }

    const { data: questions, error } = await query;

    if (error || !questions || questions.length === 0) {
        console.error('Error fetching questions:', error);
        return;
    }

    const randomIndex = Math.floor(Math.random() * questions.length);
    return questions[randomIndex];
}

async function getQuestionById(questionId:string): Promise<Question | undefined> {
    const { data: question, error } = await supabase
        .from('questions')
        .select('*')
        .eq('id', questionId)
        .limit(1)
        .single()
        ;

    if (error || !question) {
        console.error('Error fetching questions:', error);
        return ;
    }

    return question
}

// Helper function to create inline keyboard from choices
function createChoicesKeyboard(choices: string[],questionId:string) {
    return Markup.inlineKeyboard(
        choices.map((choice, index) => {
            console.log(`answer:${questionId}_${index}`);
            return [
            Markup.button.callback(choice, `answer:${questionId}_${index}`)
        ]})
    );
}

// Helper function to update session score
async function updateSessionScore(sessionId: string, isCorrect: boolean): Promise<void> {
    const { data: session } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

    console.log('update session',session)
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

type SessionMode = Database['public']['Enums']['session_mode'];

// Helper function to create a new session
async function createSession(ctx: Context, mode: SessionMode): Promise<string | null> {
    if (!ctx.from) {
        return null;
    }

    const newSession = {
        tg_id: ctx.from.id.toString(),
        tg_handle: ctx.from.username || 'unknown',
        created_date: new Date().toISOString(),
        questions: 0,
        correct: 0,
        mode: mode,
        max_question: 10 // Default value, could be made configurable
    };

    const { data: session, error } = await supabase
        .from('sessions')
        .insert([newSession])
        .select('id')
        .single();

    if (error || !session) {
        console.error('Error creating session:', error);
        return null;
    }

    return session.id;
}

// Helper function to get session by ID
async function getSession(sessionId: string): Promise<Session | null> {
    const { data: session, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

    if (error || !session) {
        console.error('Error getting session:', error);
        return null;
    }

    return session;
}
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
    await ctx.reply(
        'Welcome to XPR Guru Bot! 🚀\nPlease select your session mode:',
        Markup.inlineKeyboard([
            [Markup.button.callback('🎲 Mixed Mode', 'mode:mixed')],
            [Markup.button.callback('👩‍💻 Developer Mode', 'mode:dev')],
            [Markup.button.callback('👤 User Mode', 'mode:user')]
        ])
    );
});

// Handle answer callbacks
bot.action(/^answer:(.+)_(\d)$/, async (ctx) => {
    const questionId = ctx.match[1];
    const givenAnswerIndex = parseInt(ctx.match[2]);
    
    if (!questionId) {
        await ctx.reply(`Question error. Can't find the question.`);
        return;
    }
    
    if (isNaN(givenAnswerIndex)) {
        await ctx.reply(`Answer error. Invalid answer index.`);
        return;
    }

    // Get the current question
    const question = await getQuestionById(questionId);
    if (!question || !question.choices) {
        await ctx.reply('Error retrieving question. Please try /start again.');
        return;
    }

    // Get current session from context
    const sessionId = ctx.session?.sessionId; // You'll need to store this in context when creating session
    if (!sessionId) {
        await ctx.reply('Session not found. Please start a new session.');
        return;
    }

    const session = await getSession(sessionId);
    if (!session) {
        await ctx.reply('Session error. Please start a new session.');
        return;
    }

    const isCorrect = givenAnswerIndex === question.answer_index;
    await updateSessionScore(sessionId, isCorrect);
    
    // Get updated session data
    const updatedSession = await getSession(sessionId);
    if (!updatedSession) {
        await ctx.reply('Error retrieving session data. Please try again.');
        return;
    }

    // Send immediate feedback
    await ctx.answerCbQuery(isCorrect ? '✅ Correct!' : '❌ Wrong!');

    // Build feedback message
    const messageParts = [
        isCorrect ? '✅ Correct!' : '❌ Wrong!',
        '',
        `📝 Question: ${question.question}`,
        `🤔 Your answer: ${question.choices[givenAnswerIndex]}`,
        `✨ Correct answer: ${question.answer}`
    ];

    if (question.answer_info) {
        messageParts.push('', `ℹ️ Explanation: ${question.answer_info}`);
    }

    messageParts.push('', `📊 Score: ${updatedSession.correct}/${updatedSession.questions} correct`);

    // Get next question
    const nextQuestion = await getRandomQuestion(session.mode);
    if (!nextQuestion || !nextQuestion.choices) {
        await ctx.reply('Error preparing next question. Please try /start again.');
        return;
    }

    await ctx.reply(
        messageParts.join('\n'),
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
        question = await getRandomQuestion(session.mode);
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
        createChoicesKeyboard(question.choices!,question.id)
    );
});

// Handle mode selection
bot.action(/^mode:(mixed|dev|user)$/, async (ctx) => {
    const mode = ctx.match[1] as SessionMode;
    await ctx.answerCbQuery(`Starting ${mode} mode...`);

    const sessionId = await createSession(ctx, mode);
    if (!sessionId) {
        await ctx.reply('Sorry, there was an error creating your session. Please try again.');
        return;
    }

    // Store session ID in context
    if (!ctx.session) ctx.session = {};
    ctx.session.sessionId = sessionId;

    const question = await getRandomQuestion(mode);
    if (!question || !question.choices) {
        await ctx.reply('Sorry, there was an error fetching a question. Please try again.');
        return;
    }

    const modeEmoji = mode === 'mixed' ? '🎲' : mode === 'dev' ? '👩‍💻' : '👤';
    await ctx.reply(
        `Session started in ${modeEmoji} ${mode} mode!\nSession ID: ${sessionId}\n\n❓ ${question.question}`,
        createChoicesKeyboard(question.choices, question.id)
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