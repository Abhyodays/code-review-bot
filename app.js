import dotenv from "dotenv";
import { App } from "octokit";
import { createNodeMiddleware } from "@octokit/webhooks";
import fs from "fs";
import http from "http";
import axios from 'axios';
import https from "https";


// This reads your `.env` file and adds the variables from that file to the `process.env` object in Node.js.
dotenv.config();

axios.defaults.httpsAgent = new https.Agent({ rejectUnauthorized: false });

// This assigns the values of your environment variables to local variables.
const appId = process.env.APP_ID;
const webhookSecret = process.env.WEBHOOK_SECRET;
const privateKeyPath = process.env.PRIVATE_KEY_PATH;

// This reads the contents of your private key file.
const privateKey = fs.readFileSync(privateKeyPath, "utf8");

// This creates a new instance of the Octokit App class.
const app = new App({
  appId: appId,
  privateKey: privateKey,
  webhooks: {
    secret: webhookSecret
  },
});
// This defines the message that your app will post to pull requests.
const messageForNewPRs = (filename, errors) => {
  return `${filename}:\n${errors.join('\n')}`;
};

// getting analyzed code from analyzer
const getAnalyzedCode = async (jsonData) => {
  return await axios.post("https://localhost:5001/api/analyze", jsonData);
}
// This adds an event handler that your code will call later. When this event handler is called, it will log the event to the console. Then, it will use GitHub's REST API to add a comment to the pull request that triggered the event.
async function handlePullRequestSynchronize({ octokit, payload }) {
  console.log(`Received a pull request event for #${payload.pull_request.number}`);
  // get files modified  in pull request
  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      pull_number: payload.pull_request.number,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    const files = response.data;
    const checkRunName = 'Code Analysis';

    let prMessage = 'Thanks for opening a new PR! \n';
    let hasErrors = false;

    for (const file of files) {
      // only consider .cs file
      if (file.filename.endsWith(".cs")) {
        try {
          const raw_data = await axios.get(file.raw_url);
          const content = raw_data.data;
          const convertedString = content
            .replace(/\\n/g, "\n")
            .replace(/\t/g, "")
            .trim();
          const jsonData = { code: convertedString };

          try {
            const apiResponse = await getAnalyzedCode(jsonData);
            const errors = apiResponse.data.result.errors;
            if (errors.length > 0) {
              hasErrors = true;
              prMessage += messageForNewPRs(file.filename, errors) + '\n';
            }
          } catch (err) {
            console.log("POST Error:", err);
          }
        } catch (error) {
          console.log("Error:", error);
        }
      }
    }
    // create a check run
    // create or update the check run for the current commit
    console.log("has error:", hasErrors);
    await octokit.request("POST /repos/{owner}/{repo}/check-runs", {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      name: checkRunName,
      head_sha: payload.pull_request.head.sha,
      status: hasErrors ? "completed" : "in_progress",
      conclusion: hasErrors ? "failure" : "success",
      output: {
        title: checkRunName,
        summary: hasErrors ? "Code analysis found errors." : "Code analysis passed successfully.",
        text: prMessage,
      },
      headers: {
        "x-github-api-version": "2022-11-28",
      },
    })
      .then(() => {
        console.log(hasErrors ? "Code analysis found errors." : "Code analysis passed successfully.");
      });

    // post comment on pull request only if there are errors
    await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.pull_request.number,
      body: prMessage,
      headers: {
        "x-github-api-version": "2022-11-28",
      },
    });
  } catch (error) {
    if (error.response) {
      console.error(`Error! Status: ${error.response.status}. Message: ${error.response.data.message}`)
    }
    console.error(error)
  }
};


// This sets up a webhook event listener. When your app receives a webhook event from GitHub with a `X-GitHub-Event` header value of `pull_request` and an `action` payload value of `opened`, it calls the `handlePullRequestOpened` event handler that is defined above.
app.webhooks.on("pull_request.synchronize", handlePullRequestSynchronize);

// This logs any errors that occur.
app.webhooks.onError((error) => {
  if (error.name === "AggregateError") {
    console.error(`Error processing request: ${error.event}`);
  } else {
    console.error(error);
  }
});

// This determines where your server will listen.
//
// For local development, your server will listen to port 3000 on `localhost`. When you deploy your app, you will change these values. For more information, see "[Deploy your app](#deploy-your-app)."
const port = 3000;
const host = 'localhost';
const path = "/api/webhook";
const localWebhookUrl = `http://${host}:${port}${path}`;

const middleware = createNodeMiddleware(app.webhooks, { path });

http.createServer(middleware).listen(port, () => {
  console.log(`Server is listening for events at: ${localWebhookUrl}`);
  console.log('Press Ctrl + C to quit.')
});
