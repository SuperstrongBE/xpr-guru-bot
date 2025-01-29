export interface Session {
    id: string;
    tg_handle: string;
    created_date: string | null;
    questions: number | null;
    correct: number | null;
}