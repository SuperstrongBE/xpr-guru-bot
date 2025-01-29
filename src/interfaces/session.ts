export interface Session {
    id: string;
    user_id: number;
    telegram_username: string;
    created_at: string;
    updated_at: string;
    current_step: number;
    status: 'active' | 'completed';
}