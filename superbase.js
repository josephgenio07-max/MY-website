import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**Save the file** (Ctrl+S)

---

## Now Your Structure Should Look Like:
```
my-website/
├── app/           ← folder
├── public/        ← folder
├── .env.local     ← file
├── supabase.js    ← file (NEW location - correct!)
├── package.json   ← file
