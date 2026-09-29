import re

with open('src/hooks/useDashboardData.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add Realtime Subscription
old_effect = '''  useEffect(() => {
    fetchData();
  }, []);'''

new_effect = '''  useEffect(() => {
    fetchData();

    // Set up Realtime subscriptions
    const channel = supabase.channel('dashboard_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tracking_events' },
        () => {
          console.log('Realtime update: tracking_events changed. Refetching...');
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emails' },
        () => {
          console.log('Realtime update: emails changed. Refetching...');
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);'''

content = content.replace(old_effect, new_effect)

with open('src/hooks/useDashboardData.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied Realtime modifications to useDashboardData.ts")
