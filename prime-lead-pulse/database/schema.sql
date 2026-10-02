-- Drop tables if they exist to start fresh
DROP TABLE IF EXISTS public.tracking_events CASCADE;
DROP TABLE IF EXISTS public.emails CASCADE;

-- 1. Create the emails table
CREATE TABLE public.emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_email VARCHAR NOT NULL,
    recipient VARCHAR,
    subject VARCHAR,
    campaign_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Secure the emails table with Row Level Security (RLS)
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

-- Allow users to insert their own emails
CREATE POLICY "Users can insert their own emails" 
ON public.emails FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Allow users to view their own emails
CREATE POLICY "Users can view their own emails" 
ON public.emails FOR SELECT 
USING (auth.uid() = user_id);


-- 2. Create the tracking_events table
CREATE TABLE public.tracking_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email_id UUID REFERENCES public.emails(id) ON DELETE CASCADE,
    event_type VARCHAR NOT NULL CHECK (event_type IN ('open', 'click')),
    url TEXT,
    ip_address VARCHAR,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Secure the tracking_events table with Row Level Security (RLS)
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

-- Allow anyone to INSERT a tracking event
CREATE POLICY "Anyone can insert tracking events" 
ON public.tracking_events FOR INSERT 
WITH CHECK (true);

-- Only allow users to view events for their own emails
CREATE POLICY "Users can view events for their own emails" 
ON public.tracking_events FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.emails
        WHERE emails.id = tracking_events.email_id
        AND emails.user_id = auth.uid()
    )
);


-- Allow users to delete their own emails
CREATE POLICY "Users can delete their own emails"
ON public.emails FOR DELETE
USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_email_type_created ON tracking_events(email_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_emails_user_created ON emails(user_id, created_at DESC);
