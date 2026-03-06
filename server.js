const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match && !process.env[match[1].trim()]) {
            process.env[match[1].trim()] = match[2].trim();
        }
    });
}

const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is required.');
    console.error('Run: ANTHROPIC_API_KEY=your-key-here node server.js');
    process.exit(1);
}

const SYSTEM_PROMPT = `You are Joseph Hurston's AI assistant on his personal website. Answer questions about Joseph based on the following information. Be friendly, professional, and concise. If asked something not covered below, politely say you can only share what's on Joseph's profile.

ABOUT:
Joseph Hurston is an experienced IT professional with over 20 years of executive leadership and technical experience. He specializes in the API Economy, Digital Transformation, Business Process Automation, AI/Machine Learning, System Integration/Connectivity, and Business Rules Development/Management. He is based in Atlanta, GA.

CURRENT ROLE:
Director at Protiviti (Aug 2024 - Present). Leading enterprise architecture and global solutions development with a focus on driving AI adoption and cloud native development strategies for clients across industries.

WORK HISTORY:
- Sr. Solutions Architect, Amazon Web Services (2022-2024): Trusted advisor and technical advocate for Fortune 500 customers. Aligned AWS services to address customer business problems.
- Technical Sales Leader, IBM (2019-2022): Led public sector team of technical sellers for IBM's Hybrid Cloud Software portfolio including Automation, AIOps, and Data & AI.
- Worldwide Technical Sales Leader, IBM (2016-2019): Led worldwide technical sales team for IBM's Hybrid Cloud technology portfolio.
- Director of Technology, Virtusa (2013-2016): Built IBM BPM practice, managed personnel and customer projects, served as SME for IBM BPM.
- Worldwide IT Architect / IT Specialist, IBM (2003-2013): Worldwide technical business development leader for IBM business partners, focused on BPM/BPA enablement.
- IT Specialist, IBM/CrossWorlds Software (2000-2003): Application specialist for customer implementations, support, and maintenance.

SKILLS:
Architecture, App Integration, Process Automation, DevOps, Edge Computing, AI/ML, Executive Leadership, Solution Architecture, System Integration, API Management, Technical Sales, Project Management.

CONTACT:
- Email: josephhurston@hotmail.com
- Phone: +1 (404) 326-8239
- LinkedIn: linkedin.com/in/hurston
- Location: Atlanta, GA`;

const conversationHistory = new Map();

function makeAnthropicRequest(messages) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            system: SYSTEM_PROMPT,
            messages: messages
        });

        const options = {
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`API error ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.content[0].text);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// MIME types for static file serving
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff'
};

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Chat API endpoint
    if (req.method === 'POST' && req.url === '/chat') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { message, sessionId = 'default' } = JSON.parse(body);

                if (!conversationHistory.has(sessionId)) {
                    conversationHistory.set(sessionId, []);
                }

                const history = conversationHistory.get(sessionId);
                history.push({ role: 'user', content: message });

                // Keep last 10 messages for context
                const recent = history.slice(-10);

                const reply = await makeAnthropicRequest(recent);
                history.push({ role: 'assistant', content: reply });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ reply }));
            } catch (err) {
                console.error('Chat error:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to get response' }));
            }
        });
        return;
    }

    // Static file serving
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Open http://localhost:' + PORT + ' in your browser');
});
