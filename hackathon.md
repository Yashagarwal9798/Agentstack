# Supermemory Local Hackathon

*Complete Conversation Guide: Concept, Setup, Memory, Integrations, and Resources*

> **Updated submission deadline**
>
> 17 July at 23:59, based on the updated deadline shared during the conversation. Confirm the timezone in the latest Discord announcement before submitting.

*Prepared from the full discussion between Yash Agarwal and ChatGPT.*

**Purpose:** Understand Supermemory Local first, then brainstorm, refine, and build a hackathon project around it.

## Contents

1. [Supermemory: Initial Context](#1-supermemory-initial-context)
2. [Supermemory Local Hackathon Details](#2-supermemory-local-hackathon-details)
3. [What Supermemory Local Is](#3-what-supermemory-local-is)
4. [Supermemory Local Quickstart, Explained](#4-supermemory-local-quickstart-explained)
5. [Two Different API Keys](#5-two-different-api-keys)
6. [Embeddings, Semantic Search, and LLM Processing](#6-embeddings-semantic-search-and-llm-processing)
7. [Vibe Coding: Auto-Integrating Supermemory](#7-vibe-coding-auto-integrating-supermemory)
8. [Claude Code Integration: Memory for the Coding Agent](#8-claude-code-integration-memory-for-the-coding-agent)
9. [Supermemory Cookbook](#9-supermemory-cookbook)
10. [Difference Between the Three Resources](#10-difference-between-the-three-resources)
11. [Recommended Hackathon Workflow](#11-recommended-hackathon-workflow)
12. [Key Principles for a Strong Submission](#12-key-principles-for-a-strong-submission)
13. [Links Discussed](#13-links-discussed)
14. [Final Mental Model](#final-mental-model)

## 1. Supermemory: Initial Context

Supermemory is a memory and context infrastructure layer for AI applications and agents. Its purpose is to help software retain useful information across conversations and sessions, retrieve relevant context by meaning, and provide that context to an AI model at the right time.

In the discussion, Supermemory was understood as a system that can support persistent memory, semantic retrieval, user-specific context, document processing, and agent integrations. For this hackathon, the important focus is Supermemory Local: the memory layer runs on the participant’s own machine.

> **Core mental model**
>
> Supermemory is primarily the memory layer. An LLM can generate the final answer, while Supermemory stores, organizes, and retrieves the relevant long-term context.

## 2. Supermemory Local Hackathon Details

Event name: Localhost:6767 — Supermemory Local Hackathon

Format: a five-day asynchronous online hackathon run natively through the Supermemory Discord community.

Theme: “Your machine. Your context. Build anything, deploy it anywhere.”

### How to enter

1. Join the Supermemory Discord.
2. Open the roles section and select the red Hacker role to unlock the hackathon channels.
3. Read the announcements channel for the latest rules, prizes, dates, and deadline changes.
4. Build alone or form a team of up to four people through the find-a-team channel.
5. Build something that meaningfully uses Supermemory Local.
6. Share progress or ask questions in the general channel.
7. Complete the mandatory Google Form.
8. Post the final project in the project showcase channel using the pinned template.
9. Community members vote by reacting with the trophy emoji on projects they like.

### Prizes

| **Place**       | **Prize** |
|-----------------|-----------|
| 1st place       | \$500     |
| 2nd place       | \$100     |
| 3rd place       | \$50      |
| People's Choice | \$50      |

All winners were also described as receiving \$1,000 in Supermemory credits for three months.

### What participants can build

- A local, privacy-first personal AI assistant with persistent memory.
- A CLI tool that remembers context across sessions.
- A second brain that lives entirely on the user’s machine.
- A Supermemory plugin for a tool that does not have one yet.
- Agents, memory systems, or context workflows running locally.
- Any surprising use case in which local memory is essential to the product experience.

### Rules discussed

1. Teams may contain one to four members; solo participation is allowed.
2. The project must meaningfully use Supermemory Local.
3. The work must be fresh: code should be written during the official build window. Existing libraries and boilerplate are allowed, but an old product cannot simply be renamed.
4. A public GitHub repository is required.
5. A demo video of no more than three minutes is required.
6. Each team may make one submission.
7. Supermemory employees and contractors are ineligible for prizes.
8. By submitting, participants allow Supermemory to feature the project on its social channels and showcase page with credit.

### Submission requirements

- **Mandatory form:** The official Google Form must be completed; this is what judges score.
- **Discord showcase post:** Use the pinned template and include the project name, one-line pitch, team, repository link, demo link, and a three-to-five-sentence explanation of how the project uses Supermemory Local.

> **Date update from the conversation**
>
> The original material listed a July 13 deadline. The user later clarified that the deadline had changed to July 17 at 23:59.

### Hackathon judging implications identified

- Supermemory Local should be essential to the idea, not added only as a storage database.
- The product should clearly benefit from persistent memory, semantic search, or context retrieval.
- The local and private nature of the system should solve a meaningful user problem.
- The idea should be feasible to build quickly and easy to demonstrate within three minutes.
- A focused and surprising use case is likely to stand out more than a generic second-brain clone.
- The public repository and commit history should clearly demonstrate fresh development.

## 3. What Supermemory Local Is

Supermemory Local is a memory server that runs on your own computer. Your application can send information to it, and Supermemory can later retrieve related information using meaning-based search.

```text
Your application
↓
Supermemory API at http://localhost:6767
↓
Processes content and creates embeddings
↓
Stores information in a local graph/database
↓
Searches for relevant memories
↓
Returns context to your application
↓
Your AI model uses that context to respond
```

Example memory:

> “Yash is building SkillMesh and prefers C++ for coding questions.”

Later query:

> “What programming language does Yash prefer?”

The query and the stored sentence do not need to use exactly the same words. Supermemory can retrieve the relevant memory because their meanings are related.

### What it can connect to

- AI agents and chat applications
- Desktop applications
- Command-line tools
- Coding assistants
- Private personal assistants
- JavaScript or Python applications
- Any program capable of making HTTP API requests

> **Important distinction**
>
> Supermemory is not automatically the chatbot itself. It stores and retrieves memory. Your application usually combines the retrieved memories with an LLM that generates the final response.

## 4. Supermemory Local Quickstart, Explained

### Step 1: Install or launch Supermemory Local

The quickstart provides multiple launch methods:

**Shell installer**

```bash
curl -fsSL https://supermemory.ai/install | bash
```

**Using Node.js / npx**

```bash
npx supermemory local
```

**Using Bun**

```bash
bunx supermemory local
```

The installer or launcher detects the environment, gets the appropriate Supermemory binary, verifies it, and may ask you to configure an LLM provider.

> **Windows consideration**
>
> The quickstart page discussed native macOS and Linux binaries. On Windows, npx, Docker, or WSL may be the practical path depending on the current documentation and release support.

### Step 2: Start the local server

```bash
supermemory-server
```

On the first launch, the server initializes its local graph engine, embedding model, database, authentication credentials, and LLM provider configuration.

**Illustrative startup output**

```text
url http://localhost:6767
database ./.supermemory
api key sm_xxxxxxxxxxxxxxxxx
org id xxxxxxxxxxxxxxxxx
```

The important result is that a local API is now available at port 6767.

### Step 3: Connect an application

**TypeScript**

```ts
import Supermemory from "supermemory";
const client = new Supermemory({
apiKey: "sm_...",
baseURL: "http://localhost:6767",
});
```

- **apiKey:** Authenticates your application with the local Supermemory server.
- **baseURL:** Forces the SDK to call the local server instead of the hosted Supermemory cloud endpoint.

### Step 4: Add a memory

**TypeScript**

```ts
await client.memories.add({
content: "I’m Dhravya. I love building dev tools and I’m allergic to peanuts.",
containerTag: "user_dhravya",
});
```

- **content:** The raw information that should be remembered.
- **containerTag:** A namespace identifying the user, project, organization, or agent to which the memory belongs.

```text
Supermemory
├── user_yash
│ ├── Likes C++
│ └── Building SkillMesh
├── user_rahul
│ └── Likes Python
└── project_hackathon
└── Deadline is July 17
```

A correct container strategy prevents one user’s or project’s memories from leaking into another user’s context.

### What happens after a memory is added

```text
Raw content
↓
Understand and process the content
↓
Create embeddings
↓
Connect related information in the memory graph
↓
Store it in the local data layer
```

The application developer does not need to manually build a vector database or calculate embeddings for every memory.

### Step 5: Search memories

**TypeScript**

```ts
const results = await client.search.memories({
q: "what food should I avoid?",
containerTag: "user_dhravya",
});
```

The search is limited to user_dhravya and can retrieve the peanut-allergy memory even though the query does not repeat the exact wording of the original sentence.

### Where local state is stored

**Default project-local data directory**

```text
./.supermemory/
```

This directory can include graph data, authentication secrets, and the embedding-model cache. Provider configuration may also be stored in a user-level Supermemory environment file.

**Optional custom data location**

```bash
SUPERMEMORY_DATA_DIR=/your/custom/path
```

> **Why this matters**
>
> Because the memory state is stored locally, it can be backed up, moved, isolated per project, and used for privacy-sensitive applications.

### Example: local career assistant

First conversation:

> User: “I am targeting backend and AI engineering roles.”

Application stores:

```ts
await client.memories.add({
content: "The user is targeting backend and AI engineering roles.",
containerTag: "user_yash",
});
```

A week later:

> User: “Is this internship relevant to me?”

The application searches for the user’s career preferences, adds the retrieved context to the prompt, and asks the LLM to compare it with the internship description.

## 5. Two Different API Keys

A central point in the discussion was that Supermemory Local may involve two separate keys with different responsibilities.

| **Key**                   | **Typical format**             | **Used for**                                                        | **Request direction**          |
|---------------------------|--------------------------------|---------------------------------------------------------------------|--------------------------------|
| Supermemory local API key | sm\_...                        | Authenticating your app with the local memory server                | Your app → Supermemory Local   |
| LLM provider API key      | Provider-specific, e.g. sk-... | Allowing Supermemory or your app to call an external language model | Supermemory/app → LLM provider |

### Supermemory local API key

```text
sm_xxxxxxxxxxxxxxxxx
```

This key protects the local Supermemory API. Your application includes it when adding or searching memories.

### LLM provider API key

This key authorizes calls to a model provider such as OpenAI, Google Gemini, Anthropic, Groq, or another OpenAI-compatible provider.

**Example environment variable**

```bash
OPENAI_API_KEY=sk-...
```

The LLM can be used to understand, extract, summarize, or organize information. For example:

```bash
Input: “Yash is building SkillMesh and wants to finish it before Friday.”
Possible extracted meaning:
- Person: Yash
- Project: SkillMesh
- Goal: finish the project
- Deadline: Friday
```

### Does the cloud LLM store the memories?

The long-term memory database can still remain local. However, if a cloud LLM is used, the content required for processing may be sent to that provider. Therefore, “local memory” does not automatically mean that every part of the pipeline is offline.

**Local memory with a cloud model**

```text
Storage: local
Embeddings: local
Search: local
LLM processing: cloud
```

### Completely local setup

To keep the full workflow on the machine, Supermemory can be paired with a local LLM runtime such as Ollama, subject to current supported configuration.

```text
Supermemory Local → Ollama → Local LLM
```

**Fully local pipeline**

```text
Storage: local
Embeddings: local
Search: local
LLM: local
```

## 6. Embeddings, Semantic Search, and LLM Processing

### What embeddings do

An embedding model converts text into numerical vectors that represent meaning. Similar ideas are positioned close together in the vector space.

```text
“I am allergic to peanuts.”
↓
[0.12, -0.45, 0.78, ...]
```

This makes it possible to connect a search query with a relevant memory even when the words differ:

```text
Query: “What food should I avoid?”
Memory: “I am allergic to peanuts.”
```

### What an LLM does

An LLM can interpret, summarize, extract, rewrite, or structure the content. It is not doing the same job as the embedding model.

```text
“I am allergic to peanuts.”
↓
Food restriction: peanuts
Reason: allergy
```

| **Component**   | **Primary role**                                            |
|-----------------|-------------------------------------------------------------|
| Embedding model | Finds memories with similar meaning                         |
| LLM             | Understands, extracts, summarizes, or organizes information |
| Supermemory     | Stores, manages, separates, links, and retrieves memories   |

> **Simple summary**
>
> Embedding model = finds relevant memories. LLM = understands and organizes information. Supermemory = manages and retrieves the memory layer.

## 7. Vibe Coding: Auto-Integrating Supermemory

The Vibe Coding guide is designed for developers who already have an application, or are creating one, and want a coding agent such as Claude Code, Cursor, Codex, or another supported tool to integrate Supermemory into it.

```text
Your project
↓
Give the coding agent access to Supermemory docs
↓
Paste the integration prompt
↓
Agent asks questions about your architecture
↓
Agent generates the integration code
```

### Documentation MCP

```text
npx -y install-mcp@latest https://supermemory.ai/docs/mcp \
--client claude-code \
--oauth=no \
-y
```

This MCP gives the coding agent a way to search the latest Supermemory documentation. It does not itself install Supermemory Local, and it does not automatically give Claude persistent memory.

```text
Claude asks how to search memories
↓
Supermemory Docs MCP searches the documentation
↓
Claude receives the current API information
```

### Questions the integration workflow may ask

- What are you building?
- Do you want direct SDK integration, raw API calls, or a Vercel AI SDK integration?
- Do memories belong to individual users, organizations, projects, or multiple scopes?
- Do you need automatic user profiles?
- How and when should memories be retrieved?
- What content should be stored, and what should be excluded?

### Example generated pattern

```ts
const client = new Supermemory({
apiKey: process.env.SUPERMEMORY_API_KEY!,
baseURL: "http://localhost:6767",
});
const memories = await client.search.memories({
q: userMessage,
containerTag: userId,
});
await client.memories.add({
content: `User: ${userMessage}\nAssistant: ${answer}`,
containerTag: userId,
});
```

### Critical Local Hackathon instruction

> **Use the local endpoint**
>
> A generic integration prompt may default to the hosted endpoint. For this hackathon, explicitly require baseURL: "http://localhost:6767" and prohibit use of the hosted api.supermemory.ai endpoint unless a particular feature genuinely requires it.

```text
This project is for the Supermemory Local hackathon.
Use the self-hosted server at:
http://localhost:6767
Do not use https://api.supermemory.ai.
Read the local key from SUPERMEMORY_API_KEY and configure the SDK with:
baseURL: "http://localhost:6767".
```

### Optional integration skill

The Vibe Coding page also described an interactive Claude Code skill such as /supermemory-integrate. Its purpose is to guide the integration process by asking questions and then writing the appropriate application code. It should not be confused with the separate Claude Code persistent-memory plugin.

## 8. Claude Code Integration: Memory for the Coding Agent

The Claude Code integration addresses a different problem: a coding agent normally loses useful development context between sessions. The plugin captures important actions and retrieves related context when a later session begins.

```text
Claude edits files and runs commands
↓
Plugin captures selected activity
↓
Activity is stored in Supermemory
↓
The session ends
↓
A later Claude Code session starts
↓
Relevant previous context is injected automatically
```

### What can be captured

- **Edit:** A source file was changed from one implementation to another.
- **Write:** A new file was created.
- **Bash:** A command or test was run, including its result.
- **Task:** A delegated agent or task was created to explore or implement something.

### Example memories available in a later session

```text
The authentication tests fail because the local database is not initialized.
The project uses Zustand instead of Redux.
The next step is to connect the memory-search endpoint to the chat API.
```

When the developer later says “Continue implementing the chat feature,” Claude can receive this context automatically rather than rediscovering the architecture and unresolved problems.

### Pointing the plugin to Supermemory Local

**macOS / Linux shell**

```bash
export SUPERMEMORY_API_URL="http://localhost:6767"
export SUPERMEMORY_CC_API_KEY="sm_your_local_key"
```

**Windows PowerShell**

```powershell
[System.Environment]::SetEnvironmentVariable(
"SUPERMEMORY_API_URL",
"http://localhost:6767",
"User"
)
[System.Environment]::SetEnvironmentVariable(
"SUPERMEMORY_CC_API_KEY",
"sm_your_local_key",
"User"
)
```

After setting persistent Windows environment variables, restart the terminal so the new values are loaded.

### Installing the plugin in Claude Code

```bash
/plugin marketplace add supermemoryai/claude-supermemory
/plugin install supermemory
```

### Controlling captured tools and injected context

```bash
export SUPERMEMORY_SKIP_TOOLS=Read,Glob,Grep
```

**~/.supermemory-claude/settings.json**

```bash
{
"skipTools": ["Read", "Glob", "Grep", "TodoWrite"],
"captureTools": ["Edit", "Write", "Bash", "Task"],
"maxContextMemories": 10,
"maxProjectMemories": 20,
"debug": false
}
```

These settings control which actions become memories, which actions are ignored, how much context is injected, and whether debugging information is displayed.

> **Hackathon relevance**
>
> Using the plugin may improve your development workflow, but it is not enough by itself. The submitted product should also meaningfully use Supermemory Local in the user-facing experience.

```text
Claude Code plugin
= useful while building
Supermemory integration inside the product
= essential for the hackathon submission
```

## 9. Supermemory Cookbook

The Cookbook provides implementation recipes and example architectures. It is most useful after the basic add-memory and search-memory APIs are understood, because it shows how those APIs fit into a complete application workflow.

### Personal AI assistant

```text
User sends a message
↓
Search previous memories
↓
Give retrieved context to the LLM
↓
Generate a personalized response
↓
Store useful information from the new interaction
```

- Remembers user preferences
- Remembers previous discussions
- Tracks ongoing projects and goals
- Maintains personal context across sessions

### Document question answering

```text
Upload PDFs or documents
↓
Supermemory processes them
↓
User asks a question
↓
Relevant sections are retrieved
↓
An LLM answers using the retrieved evidence
```

### Customer support bot

- Remembers earlier complaints and support conversations
- Retrieves previous solutions
- Tracks unresolved issues
- Maintains customer preferences and account context
- Avoids repeatedly asking users for information they already provided

### AI SDK integration

The Cookbook can also demonstrate how Supermemory works with an AI SDK, including memory injection and tool-driven agent patterns.

### How to use Cookbook examples correctly

> **Do not simply rename a recipe**
>
> A stronger hackathon project combines an original problem and workflow with a relevant Cookbook architecture, then adapts the memory model, retrieval strategy, interface, and local-privacy value to the use case.

```text
Your original idea
+
Relevant Cookbook architecture
+
Supermemory Local configuration
+
A distinctive workflow and interface
```

Example: a personalized learning application could combine personal-assistant memory with document Q&A, then add a custom system for identifying weak concepts, planning revision, and keeping all learning history local.

## 10. Difference Between the Three Resources

| **Resource**       | **What it affects**                     | **Main purpose**                                            |
|--------------------|-----------------------------------------|-------------------------------------------------------------|
| Vibe Coding        | Your application source code            | Lets a coding agent integrate Supermemory into your product |
| Claude Code plugin | The coding agent’s development sessions | Gives Claude Code memory between sessions                   |
| Cookbook           | Your architecture and understanding     | Provides complete example patterns to learn from and adapt  |

```text
Vibe Coding → helps an AI agent add Supermemory to your app
Claude Code → gives the coding agent itself persistent memory
Cookbook → gives you reusable example architectures
```

## 11. Recommended Hackathon Workflow

1. Brainstorm and choose a focused problem in which memory is genuinely necessary.
2. Define the target user, the repeated context they currently lose, and why local storage matters.
3. Identify the closest Cookbook architecture, but use it only as a technical reference.
4. Run Supermemory Local and verify that add-memory and semantic-search requests work.
5. Choose a containerTag strategy for users, projects, workspaces, or agents.
6. Use the Vibe Coding guide or documentation MCP to help the coding agent integrate the correct current APIs.
7. Explicitly configure the local base URL at http://localhost:6767.
8. Optionally install the Claude Code plugin to retain development context while building.
9. Build the smallest end-to-end workflow in which a user adds information, leaves, returns, and benefits from a retrieved memory.
10. Make the local/private advantage visible in the interface and the demo.
11. Prepare a three-minute demo that shows the problem, the memory being created, retrieval in a later context, and the user benefit.
12. Complete both the official form and the Discord showcase post before the updated deadline.

## 12. Key Principles for a Strong Submission

- **Memory must change the outcome:** The app should produce a better result because it remembers something useful from an earlier session.
- **Local must matter:** The product should handle private, sensitive, proprietary, or highly personal context that users may not want stored in a hosted service.
- **Retrieval should be semantic:** The demo should show that related context can be found even when the user uses different wording.
- **Context needs boundaries:** Use container tags or equivalent separation so memories remain scoped to the correct person or project.
- **Avoid a generic chatbot:** A polished but ordinary chat interface with “memory” added is less compelling than a specialized workflow.
- **Design for the demo:** A judge should understand the problem, memory loop, and impact within three minutes.
- **Build the MVP first:** Prioritize a reliable add → store → retrieve → act loop before adding secondary features.
- **Show technical meaning:** Explain precisely what is stored, what is retrieved, why it is relevant, and how the LLM uses it.

### Questions to answer while brainstorming the project

1. Who is the exact user?
2. What information do they repeatedly lose or re-explain?
3. Why is ordinary database lookup not enough?
4. What can semantic memory retrieve that keyword search would miss?
5. Why should this information remain on the user’s machine?
6. What memory should be stored automatically, and what should require user approval?
7. How will incorrect or outdated memories be corrected?
8. What is the smallest impressive workflow that can be completed before the deadline?
9. What moment in the demo will make the judges immediately understand the value?

## 13. Links Discussed

- **Supermemory Local quickstart:** [https://supermemory.ai/docs/self-hosting/quickstart](https://supermemory.ai/docs/self-hosting/quickstart)
- **Supermemory Local overview:** [https://supermemory.ai/docs/self-hosting/overview](https://supermemory.ai/docs/self-hosting/overview)
- **Supermemory quickstart: first API call:** [https://supermemory.ai/docs/quickstart](https://supermemory.ai/docs/quickstart)
- **Add memories:** [https://supermemory.ai/docs/add-memories](https://supermemory.ai/docs/add-memories)
- **Search memories:** [https://supermemory.ai/docs/search](https://supermemory.ai/docs/search)
- **Supermemory SDK integrations:** [https://supermemory.ai/docs/integrations/supermemory-sdk](https://supermemory.ai/docs/integrations/supermemory-sdk)
- **Vibe Coding:** [https://supermemory.ai/docs/vibe-coding](https://supermemory.ai/docs/vibe-coding)
- **Claude Code integration:** [https://supermemory.ai/docs/integrations/claude-code](https://supermemory.ai/docs/integrations/claude-code)
- **Cookbook overview:** [https://supermemory.ai/docs/cookbook/overview](https://supermemory.ai/docs/cookbook/overview)
- **OpenAPI specification:** [https://api.supermemory.ai/v3/openapi](https://api.supermemory.ai/v3/openapi)
- **Full documentation index for LLMs:** [https://supermemory.ai/docs/llms.txt](https://supermemory.ai/docs/llms.txt)
- **Supermemory Discord:** [https://discord.com/invite/WtkvM62fHK](https://discord.com/invite/WtkvM62fHK)

### Google Forms mentioned in the supplied hackathon material

- [https://forms.gle/A9dxNCfnqq2SVt3N9](https://forms.gle/A9dxNCfnqq2SVt3N9)
- [https://forms.gle/ARXHNpFY5VNfiNDBA](https://forms.gle/ARXHNpFY5VNfiNDBA)

> **Use the latest announcement**
>
> Two different Google Form links appeared in the provided material. Use the current link pinned in the latest Discord announcement rather than assuming either older link is still active.

## Final Mental Model

```text
Add information → Supermemory processes and stores it locally
↓
Ask a meaning-based question → Retrieve relevant memories
↓
Give those memories to an agent or LLM
↓
Generate a personalized or context-aware action
↓
Store new durable context for the next session
```

The strongest hackathon idea will make this memory loop central to the product, clearly demonstrate why local processing matters, and package the result in a focused workflow that can be understood immediately.