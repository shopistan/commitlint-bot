// Packages
const { lint, load } = require('@commitlint/core');

// Ours
const config = require('./config');
const format = require('./format');
const checkComments = require('./comments');

/**
 * Runs commitlint against all commits of the pull request and sets an appropriate
 * status check
 */
async function commitlint(context) {
	// 1. Extract necessary info
	const repo = context.repo(); // returns e.g { owner: 'Shakeel22797', repo: 'shopistan' }
	const pull_info = context.issue(); // returns e.g {number: 47, owner: 'Shakeel22797', repo: 'shopistan'}
	// replacing number variable as pull_number b/c number is depricated
	const pull={ pull_number : pull_info.number, owner : pull_info.owner ,repo : pull_info.repo}; 
	const { sha } = context.payload.pull_request.head;
	// replacing number variable as issue_number b/c number is depricated
    const context_issue = { issue_number : pull_info.number, owner : pull_info.owner ,repo : pull_info.repo };
	const pr_title=context.payload.pull_request.title; // PR title
	const pr_description=context.payload.pull_request.body; // PR Description
	// GH API
	const { paginate, issues, repos, pullRequests } = context.github;

	// Hold this PR info
	const statusInfo = { ...repo, sha, context: 'commitlint' };

	// Pending
	await repos.createStatus({
		...statusInfo,
		state: 'pending',
		description: 'Waiting for the status to be reported'
	});

	// Paginate all PR commits
	return paginate(pullRequests.listCommits(pull), async ({ data }) => {
		// empty summary
		const report = { valid: true, commits: [], pr: {status: true} };
		const { rules } = await load(config);

		// Keep counters
		let errorsCount = 0;
		let warnsCount = 0;
		
			//Checking the PR Title
           var re = /^([A-Z]+-[0-9]+:\s.*$)/;
           var pr_status=pr_title.match(re);
   
           if (pr_status==null || pr_description.length==0){          
           report.valid = false;
           report.pr.status = false;
           if (pr_status==null && pr_description.length==0){
             errorsCount+=2;
           }
           else{
           errorsCount+=1; }
           }    
		   
		// Iterates over all commits
		for (const d of data) {
			const { valid, errors, warnings } = await lint(
				d.commit.message,
				rules
			);
			if (!valid) {
				report.valid = false;
			}

			if (errors.length > 0 || warnings.length > 0) {
				// Update counts
				errorsCount += errors.length;
				warnsCount += warnings.length;
				
				report.commits.push({ sha: d.sha, title:d.commit.message, errors, warnings });
			}
		}

		// Final status
		await repos.createStatus({
			...statusInfo,
			state: report.valid ? 'success' : 'failure',
			description: `found ${errorsCount} problems, ${warnsCount} warnings`
		});

		// Get commit
		const comment = await checkComments(issues, context_issue);

		// Write a comment with the details (if any)
		if (errorsCount > 0 || warnsCount > 0) {
			const message = format(report);
			if (comment) {
				// edits previous bot comment if found
				await issues.editComment({
					...context_issue,
					id: comment.id,
					body: message
				});
			} else {
				// if no previous comment create a new one
				await issues.createComment({ ...context_issue, body: message });
			}
		} else {
			if (comment) {
				// edits previous bot comment if found
				await issues.deleteComment({ ...context_issue, comment_id: comment.id });
			}
		}
	});
}

module.exports = commitlint;
