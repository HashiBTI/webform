/**
 * server.js
 * CFF backend — serves the static frontend and exposes the ONE endpoint
 * the browser is allowed to call for AI analysis: POST /api/analyse-values.
 *
 * The AI provider API key lives only here, read from environment
 * variables via dotenv. It is never sent to, or readable from, the browser.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { createClient } = require('@supabase/supabase-js');

const app = express();

/* ------------------------------------------------------------------ */
/* Config                                                             */
/* ------------------------------------------------------------------ */

const PORT = Number(process.env.PORT) || 3000;
const AI_PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
const AI_MODEL =
    process.env.AI_MODEL ||
    (AI_PROVIDER === 'gemini' ? 'gemini-2.5-flash' : 'claude-sonnet-5');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const CORS_ORIGIN = process.env.CORS_ORIGIN || true;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 20;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/* ------------------------- SUPABASE ------------------------- */

const SUPABASE_URL = process.env.SUPABASE_URL || '';

const SUPABASE_KEY =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    '';

function isValidHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    if (isValidHttpUrl(SUPABASE_URL)) {
        try {
            supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false
                }
            });
        } catch (err) {
            console.warn(
                `⚠️ Could not initialise Supabase client (${err.message}). Continuing without it.`
            );
        }
    } else {
        console.warn(
            `⚠️ SUPABASE_URL ("${SUPABASE_URL}") is not a valid http(s) URL. Continuing without Supabase.`
        );
    }
}

if (AI_PROVIDER === 'gemini' && !GEMINI_API_KEY) {
    console.warn(
        '⚠️ GEMINI_API_KEY is not set. AI analysis will not work until it is configured.'
    );
} else if (AI_PROVIDER === 'anthropic' && !ANTHROPIC_API_KEY) {
    console.warn(
        '⚠️ ANTHROPIC_API_KEY is not set. AI analysis will not work until it is configured.'
    );
}

if (!supabase) {
    console.warn(
        '⚠️ Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY.'
    );
}

/* ------------------------------------------------------------------ */
/* Questions                                                          */
/* ------------------------------------------------------------------ */

const QUESTIONS = [
    { n: 1, q: "How do you fill your space?" },
    { n: 2, q: "How do you spend your time?" },
    { n: 3, q: "How do you spend your energy?" },
    { n: 4, q: "How do you spend your money?" },
    { n: 5, q: "In which areas are you most organised?" },
    { n: 6, q: "Where are you most reliable?" },
    { n: 7, q: "What dominates your thoughts?" },
    { n: 8, q: "What do you visualise most?" },
    { n: 9, q: "What do you most often talk to yourself about?" },
    { n: 10, q: "What do you most often talk to others about?" },
    { n: 11, q: "What inspires you?" },
    {
        n: 12,
        q: "Which goals stand out in your life and have stood the test of time?"
    },
    {
        n: 13,
        q: "What topics do you regularly study, read about, or research?"
    }
];

/* ------------------------------------------------------------------ */
/* Validation Schemas                                                 */
/* ------------------------------------------------------------------ */

const AnswerSchema = z.object({
    n: z.number().int().min(1).max(13),
    q: z.string().min(1).max(300),
    values: z.array(z.string().trim().min(1)).length(3)
});

const RequestSchema = z.object({
    role: z.string().trim().min(1).max(80),
    answers: z.array(AnswerSchema).length(13)
});

const ChatHistoryItemSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(2000)
});

const ChatRequestSchema = z.object({
    message: z.string().trim().min(1).max(1000),
    history: z.array(ChatHistoryItemSchema).optional().default([])
});

const LeadRequestSchema = z.object({
    name: z.string().trim().min(2).max(100),

    phone: z.string()
        .trim()
        .min(7)
        .max(20)
        .regex(/^[0-9+()\-\s]+$/),

    email: z.union([
        z.string().email().max(150),
        z.literal(''),
        z.null()
    ])
        .optional()
        .transform(v => v || null)
});

const ConfidenceEnum = z.enum([
    'strong',
    'moderate',
    'emerging'
]);

const TopValueSchema = z.object({
    name: z.string(),
    confidenceLevel: ConfidenceEnum,
    evidence: z.string(),
    explanation: z.string().optional().default('')
});

const SupportingValueSchema = z.object({
    name: z.string(),
    confidenceLevel: ConfidenceEnum,
    evidence: z.string()
});

const AnalysisSchema = z.object({
    topValues: z.array(TopValueSchema).length(3),
    supportingValues: z.array(SupportingValueSchema).length(5),
    repeatedThemes: z.array(z.string()).default([]),
    behaviouralPatterns: z.array(z.string()).default([]),
    timeAreas: z.array(z.string()).default([]),
    energyAreas: z.array(z.string()).default([]),
    moneyAreas: z.array(z.string()).default([]),
    inspirationSources: z.array(z.string()).default([]),
    longTermGoals: z.array(z.string()).default([]),
    learningInterests: z.array(z.string()).default([]),
    possibleConflicts: z.array(z.string()).default([]),
    personalStrengths: z.array(z.string()).default([]),
    developmentAreas: z.array(z.string()).default([]),
    valuesStatement: z.string(),
    recommendedNextSteps: z.array(z.string()).default([])
});
/* ------------------------------------------------------------------ */
/* Prompt Construction                                                */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are the AI Advisor for the Company Formation Framework application.
Your responsibility is to analyse the user's answers accurately, respectfully, and systematically.

Always analyse the complete set of available answers before drawing conclusions.
Use evidence directly from the user's responses.
Do not invent information.

Return ONLY valid JSON. Do not include markdown code fences, commentary, or any text
outside the JSON object. The JSON object must match this exact shape and constraints:

{
  "topValues": [
    // EXACTLY 3 items
    {
      "name": string,
      "confidenceLevel": "strong" | "moderate" | "emerging",
      "evidence": string,
      "explanation": string  // optional, omit or use "" if not needed
    }
  ],
  "supportingValues": [
    // EXACTLY 5 items
    {
      "name": string,
      "confidenceLevel": "strong" | "moderate" | "emerging",
      "evidence": string
    }
  ],
  "repeatedThemes": string[],
  "behaviouralPatterns": string[],
  "timeAreas": string[],
  "energyAreas": string[],
  "moneyAreas": string[],
  "inspirationSources": string[],
  "longTermGoals": string[],
  "learningInterests": string[],
  "possibleConflicts": string[],
  "personalStrengths": string[],
  "developmentAreas": string[],
  "valuesStatement": string,       // required, a short paragraph
  "recommendedNextSteps": string[]
}

Rules:
- "topValues" must contain EXACTLY 3 entries, ranked most to least dominant.
- "supportingValues" must contain EXACTLY 5 entries.
- "confidenceLevel" must be exactly one of: "strong", "moderate", "emerging" (lowercase, no other values).
- All array fields other than topValues/supportingValues can be empty arrays if there is no
  evidence, but the field itself must still be present.
- "valuesStatement" is required and must not be empty.
- Do not wrap the JSON in \`\`\`json or any other formatting — return the raw JSON object only.`;

const CHAT_SYSTEM_PROMPT = `You are the Ask CFF AI assistant.

Help users understand:
- Company Formation Framework
- Values Assessment
- Business Owner
- Employee
- Visitor

Keep answers short and friendly.`;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildUserMessage(role, answers) {

    const lines = answers
        .map(a =>
            `Q${a.n}. ${a.q}

Answer 1: ${a.values[0]}
Answer 2: ${a.values[1]}
Answer 3: ${a.values[2]}`
        )
        .join("\n\n");

    return `User Role: ${role}

${lines}`;
}

async function callAnthropic({
    systemPrompt,
    userMessage,
    messages,
    maxTokens
}) {

    if (!ANTHROPIC_API_KEY) {

        const err = new Error("Anthropic API key missing");
        err.code = "MISSING_API_KEY";
        throw err;

    }

    const response = await fetch(
        "https://api.anthropic.com/v1/messages",
        {

            method: "POST",

            headers: {

                "Content-Type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01"

            },

            body: JSON.stringify({

                model: AI_MODEL,
                max_tokens: maxTokens || 4000,

                system: systemPrompt,

                messages:
                    messages ||
                    [
                        {
                            role: "user",
                            content: userMessage
                        }
                    ]

            })

        }
    );

    if (!response.ok) {

        const errorBody = await response.text().catch(() => "");

        console.error(
            `CFF: Anthropic API returned ${response.status} for model "${AI_MODEL}":`,
            errorBody
        );

        throw new Error(
            `Anthropic returned ${response.status}`
        );

    }

    const data = await response.json();

    const textBlock =
        data.content.find(x => x.type === "text");

    return textBlock.text;

}

/**
 * Calls Google's Gemini API (generateContent).
 * Gemini uses 'user' / 'model' roles instead of Anthropic's 'user' / 'assistant',
 * and takes the system prompt as a separate `systemInstruction` field rather
 * than a top-level `system` string — both are translated here so the rest of
 * the server (buildUserMessage, the /api/analyse-values and /api/chat routes)
 * doesn't need to know which provider is active.
 */
async function callGemini({
    systemPrompt,
    userMessage,
    messages,
    maxTokens
}) {

    if (!GEMINI_API_KEY) {

        const err = new Error("Gemini API key missing");
        err.code = "MISSING_API_KEY";
        throw err;

    }

    const chatMessages =
        messages ||
        [
            {
                role: "user",
                content: userMessage
            }
        ];

    const contents = chatMessages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
    }));

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                system_instruction: {
                    parts: [{ text: systemPrompt }]
                },

                contents,

                generationConfig: {
                    maxOutputTokens: maxTokens || 4000
                }

            })

        }
    );

    if (!response.ok) {

        const errorBody = await response.text().catch(() => "");

        console.error(
            `CFF: Gemini API returned ${response.status} for model "${AI_MODEL}":`,
            errorBody
        );

        throw new Error(
            `Gemini returned ${response.status}`
        );

    }

    const data = await response.json();

    const text =
        data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text;

    if (!text) {

        throw new Error("Gemini returned an empty response");

    }

    return text;

}

const PROVIDERS = {

    anthropic: callAnthropic,
    gemini: callGemini

};

async function callAiProvider(args) {

    const fn = PROVIDERS[AI_PROVIDER];

    if (!fn) {

        throw new Error(
            "Unsupported AI Provider"
        );

    }

    return fn(args);

}

function extractJson(raw) {

    const cleaned = raw
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    return JSON.parse(cleaned);

}

/* ------------------------------------------------------------------ */
/* Middleware                                                         */
/* ------------------------------------------------------------------ */

app.disable("x-powered-by");

app.use(
    helmet({

        contentSecurityPolicy: {

            directives: {

                defaultSrc: ["'self'"],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://fonts.googleapis.com"
                ],
                fontSrc: [
                    "'self'",
                    "https://fonts.gstatic.com"
                ],
                scriptSrc: ["'self'"],
                connectSrc: ["'self'"],
                imgSrc: ["'self'", "data:"],
                objectSrc: ["'none'"]

            }

        }

    })
);

app.use(
    cors({
        origin: CORS_ORIGIN
    })
);

app.use(
    express.json({
        limit: "100kb"
    })
);

const analyseLimiter = rateLimit({

    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false

});

const chatLimiter = rateLimit({

    windowMs: RATE_LIMIT_WINDOW_MS,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false

});

const leadLimiter = rateLimit({

    windowMs: RATE_LIMIT_WINDOW_MS,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false

});

/* ------------------------------------------------------------------ */
/* Static Files                                                       */
/* ------------------------------------------------------------------ */

app.get("/manifest.json", (req, res, next) => {

    res.type("application/manifest+json");

    next();

});

app.get("/sw.js", (req, res, next) => {

    res.set(
        "Service-Worker-Allowed",
        "/"
    );

    next();

});

app.use(

    express.static(

        path.join(__dirname, ".."),

        {

            dotfiles: "ignore",
            index: "index.html"

        }

    )

);
/* ------------------------------------------------------------------ */
/* API Routes                                                         */
/* ------------------------------------------------------------------ */

/**
 * Save lead details in Supabase.
 *
 * Frontend sends:
 * {
 *   name: string,
 *   phone: string,
 *   email: string
 * }
 */

app.post("/api/leads", leadLimiter, async (req, res) => {

    if (!supabase) {

        return res.status(500).json({
            error: "The lead database is not configured on this server.",
            code: "SUPABASE_NOT_CONFIGURED"
        });

    }

    const parsed = LeadRequestSchema.safeParse(req.body);

    if (!parsed.success) {

        return res.status(400).json({
            error: "Please enter a valid name, phone number, and email address.",
            code: "VALIDATION_ERROR",
            details: parsed.error.issues.map(issue => ({
                path: issue.path,
                message: issue.message
            }))
        });

    }

    const {
        name,
        phone,
        email
    } = parsed.data;

    try {

        const { data, error } = await supabase
            .from("leads")
            .insert([
                {
                    name,
                    phone,
                    email
                }
            ])
            .select();

        if (error) {

            console.log("========== SUPABASE ERROR ==========");
            console.log("Message:", error.message);
            console.log("Code:", error.code);
            console.log("Details:", error.details);
            console.log("Hint:", error.hint);
            console.log("Full error:", error);
            console.log("====================================");

            return res.status(500).json({
                error: error.message || "Supabase could not save the lead.",
                code: error.code || "LEAD_INSERT_FAILED",
                details: error.details || null,
                hint: error.hint || null
            });

        }

        console.log("Lead saved successfully:", data);

        return res.status(201).json({
            success: true,
            message: "Your enquiry has been submitted successfully.",
            lead: Array.isArray(data) && data.length > 0
                ? data[0]
                : null
        });

    } catch (error) {

        console.log("========== NODE ERROR ==========");
        console.log(error);
        console.log("================================");

        return res.status(500).json({
            error: error.message || "Unexpected server error.",
            code: "LEAD_INSERT_FAILED"
        });

    }

});


/**
 * Values Assessment AI analysis.
 */

app.post(
    "/api/analyse-values",
    analyseLimiter,
    async (req, res) => {

        const parsed = RequestSchema.safeParse(req.body);

        if (!parsed.success) {

            return res.status(400).json({
                error:
                    "Your submission is incomplete or invalid. Please make sure all 13 questions have three answers each.",
                code: "VALIDATION_ERROR",
                details: parsed.error.issues.map(issue => ({
                    path: issue.path,
                    message: issue.message
                }))
            });

        }

        const {
            role,
            answers
        } = parsed.data;

        const answersByNumber = new Map(
            answers.map(answer => [
                answer.n,
                answer
            ])
        );

        for (const question of QUESTIONS) {

            const submittedQuestion =
                answersByNumber.get(question.n);

            if (
                !submittedQuestion ||
                submittedQuestion.q.trim() !== question.q
            ) {

                return res.status(400).json({
                    error:
                        "The submitted questions do not match the Values Assessment. Please reload and try again.",
                    code: "QUESTION_MISMATCH"
                });

            }

        }

        try {

            const userMessage =
                buildUserMessage(role, answers);

            const rawResponse =
                await callAiProvider({
                    systemPrompt: SYSTEM_PROMPT,
                    userMessage
                });

            let result;

            try {

                result = extractJson(rawResponse);

            } catch (error) {

                console.error(
                    "CFF: AI response was not valid JSON",
                    error
                );

                return res.status(502).json({
                    error:
                        "The AI returned a response we could not read. Please try again.",
                    code: "AI_INVALID_JSON"
                });

            }

            const validated =
                AnalysisSchema.safeParse(result);

            if (!validated.success) {

                console.error(
                    "CFF: AI response failed schema validation",
                    validated.error.issues
                );

                return res.status(502).json({
                    error:
                        "The AI response was in an unexpected format. Please try again.",
                    code: "AI_SCHEMA_INVALID",
                    details: validated.error.issues.map(issue => ({
                        path: issue.path,
                        message: issue.message
                    }))
                });

            }

            return res.status(200).json({
                result: validated.data
            });

        } catch (error) {

            console.error(
                "CFF: AI provider call failed:",
                error
            );

            if (error.code === "MISSING_API_KEY") {

                return res.status(500).json({
                    error:
                        AI_PROVIDER === "gemini"
                            ? "The server is not configured with a Gemini API key. Add GEMINI_API_KEY to your .env file."
                            : "The server is not configured with an Anthropic API key. Add ANTHROPIC_API_KEY to your .env file.",
                    code: "MISSING_API_KEY"
                });

            }

            return res.status(502).json({
                error:
                    "The AI provider could not complete the request. Please try again in a moment.",
                code: "AI_PROVIDER_ERROR"
            });

        }

    }
);


/**
 * Ask CFF AI chat endpoint.
 */

app.post(
    "/api/chat",
    chatLimiter,
    async (req, res) => {

        const parsed =
            ChatRequestSchema.safeParse(req.body);

        if (!parsed.success) {

            return res.status(400).json({
                error:
                    "Your message could not be read. Please try again.",
                code: "VALIDATION_ERROR",
                details: parsed.error.issues.map(issue => ({
                    path: issue.path,
                    message: issue.message
                }))
            });

        }

        const {
            message,
            history
        } = parsed.data;

        const trimmedHistory =
            history.slice(-10);

        const messages = [

            ...trimmedHistory.map(item => ({
                role: item.role,
                content: item.content
            })),

            {
                role: "user",
                content: message
            }

        ];

        try {

            const reply =
                await callAiProvider({
                    systemPrompt: CHAT_SYSTEM_PROMPT,
                    messages,
                    maxTokens: 500
                });

            return res.status(200).json({
                reply: reply.trim()
            });

        } catch (error) {

            console.error(
                "CFF: Chat AI provider failed:",
                error
            );

            if (error.code === "MISSING_API_KEY") {

                return res.status(500).json({
                    error:
                        AI_PROVIDER === "gemini"
                            ? "The server is not configured with a Gemini API key. Add GEMINI_API_KEY to your .env file."
                            : "The server is not configured with an Anthropic API key. Add ANTHROPIC_API_KEY to your .env file.",
                    code: "MISSING_API_KEY"
                });

            }

            return res.status(502).json({
                error:
                    "The AI provider could not complete the request. Please try again in a moment.",
                code: "AI_PROVIDER_ERROR"
            });

        }

    }
);


/* ------------------------------------------------------------------ */
/* Unknown API Route                                                  */
/* ------------------------------------------------------------------ */

app.use("/api", (req, res) => {

    return res.status(404).json({
        error: "API route not found.",
        code: "NOT_FOUND"
    });

});


/* ------------------------------------------------------------------ */
/* Global Error Handler                                               */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {

    console.error(
        "CFF: Unhandled server error:",
        error
    );

    return res.status(500).json({
        error: "Something went wrong on the server.",
        code: "INTERNAL_ERROR"
    });

});


/* ------------------------------------------------------------------ */
/* Start Server                                                       */
/* ------------------------------------------------------------------ */

app.listen(PORT, () => {

    console.log(
        `CFF server running at http://localhost:${PORT}`
    );

    console.log(
        `AI provider: ${AI_PROVIDER} (${AI_MODEL})`
    );

    console.log(
        `Supabase leads: ${
            supabase
                ? "CONFIGURED"
                : "NOT CONFIGURED"
        }`
    );

});