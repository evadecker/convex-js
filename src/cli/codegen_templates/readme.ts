export function readmeCodegen() {
  return `# Welcome to your Convex functions directory!

Write your Convex functions here. See
https://docs.convex.dev/using/writing-convex-functions for more.

A query function that takes two arguments looks like:

\`\`\`javascript
// myQueryFunction.js
import { query } from "./_generated/server";
import { v } from "convex/values";

export default query({
  // Validators for arguments.
  args: {
    first: v.number(),
    second: v.string(),
  },

  // Function implementation.
  hander: async ({ db }, { first, second }) => {
    // Read the database as many times as you need here.
    // See https://docs.convex.dev/database/reading-data.
    const documents = await db.query("tablename").collect();

    // Write arbitrary JavaScript here: filter, aggregate, build derived data,
    // remove non-public properties, or create new objects.
    return documents;
  },
});
\`\`\`

Using this query function in a React component looks like:

\`\`\`javascript
const data = useQuery("myQueryFunction", { first: 10, second: "hello" });
\`\`\`


A mutation function looks like:

\`\`\`javascript
// myMutationFunction.js
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export default mutation({
  // Validators for arguments.
  args: {
    first: v.string(),
    second: v.string(),
  },

  // Function implementation.
  hander: async ({ db }, { first, second }) => {
    // Insert or modify documents in the database here.
    // Mutations can also read from the database like queries.
    // See https://docs.convex.dev/database/writing-data.
    const message = { body: first, author: second };
    const id = await db.insert("messages", message);

    // Optionally, return a value from your mutation.
    return await db.get(id);
  },
});
\`\`\`

Using this mutation function in a React component looks like:

\`\`\`javascript
const mutation = useMutation("myMutationFunction");
function handleButtonPress() {
  // fire and forget, the most common way to use mutations
  mutation({ first: "Hello!", second: "me" });
  // OR
  // use the result once the mutation has completed
  mutation({ first: "Hello!", second: "me" }).then(result => console.log(result));
}
\`\`\`

The Convex CLI is your friend. See everything it can do by running
\`npx convex -h\` in your project root directory. To learn more, launch the docs
with \`npx convex docs\`.
`;
}
