-- Create boards table for storing user data
CREATE TABLE IF NOT EXISTS boards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own data
CREATE POLICY "Users can view their own board"
    ON boards FOR SELECT
    USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own data
CREATE POLICY "Users can insert their own board"
    ON boards FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own data
CREATE POLICY "Users can update their own board"
    ON boards FOR UPDATE
    USING (auth.uid() = user_id);

-- Create policy to allow users to delete their own data
CREATE POLICY "Users can delete their own board"
    ON boards FOR DELETE
    USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS boards_user_id_idx ON boards(user_id);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE boards;
