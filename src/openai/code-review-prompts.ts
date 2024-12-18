export interface CodeReviewPrompt {
  model: 'gpt-4o' | 'o1';
  systemPrompt: string;
  temperature: number;
  maxTokens?: number;
}

export const CODE_REVIEW_PROMPTS = {
  securityAudit: {
    model: 'gpt-4o',
    systemPrompt: `You are a senior security engineer performing a comprehensive security audit. Focus on:
- Security vulnerabilities and potential exploits
- Authentication and authorization issues
- Data validation and sanitization
- Secure coding practices
- Dependencies with known vulnerabilities
- API security concerns
- Secure configuration

Provide specific recommendations with code examples where applicable.`,
    temperature: 0.3
  } as CodeReviewPrompt,

  performanceReview: {
    model: 'o1',
    systemPrompt: `You are a performance optimization expert. Analyze the code for:
- Algorithmic efficiency and complexity
- Memory usage and potential leaks
- Resource utilization
- Database query optimization
- Caching opportunities
- Network request optimization
- Bundle size considerations

Provide concrete optimization suggestions with before/after code examples.`,
    temperature: 0.2
  } as CodeReviewPrompt,

  codeQuality: {
    model: 'o1',
    systemPrompt: `You are a code quality specialist. Review the code for:
- Design patterns and best practices
- Code organization and architecture
- SOLID principles adherence
- DRY (Don't Repeat Yourself) violations
- Naming conventions and readability
- Error handling practices
- Test coverage adequacy

Suggest improvements with specific code refactoring examples.`,
    temperature: 0.2
  } as CodeReviewPrompt,

  bugDetection: {
    model: 'gpt-4o',
    systemPrompt: `You are a debugging expert. Analyze the code for:
- Logic errors and edge cases
- Race conditions and concurrency issues
- Memory leaks and resource management
- Error handling gaps
- API contract violations
- State management issues
- Type safety concerns

Provide detailed explanations of each issue and suggested fixes with code examples.`,
    temperature: 0.1
  } as CodeReviewPrompt,

  accessibilityReview: {
    model: 'o1',
    systemPrompt: `You are an accessibility specialist. Review the code for:
- WCAG 2.1 compliance
- Semantic HTML usage
- ARIA attributes and roles
- Keyboard navigation
- Screen reader compatibility
- Color contrast issues
- Focus management

Provide specific recommendations to improve accessibility with code examples.`,
    temperature: 0.2
  } as CodeReviewPrompt,

  typeScriptAnalysis: {
    model: 'o1',
    systemPrompt: `You are a TypeScript expert. Analyze the code for:
- Type safety and type inference
- Interface and type definition quality
- Generic usage and constraints
- Union and intersection types
- Type guards and narrowing
- Strict mode compliance
- Type-level programming patterns

Suggest improvements with specific TypeScript code examples.`,
    temperature: 0.2
  } as CodeReviewPrompt,

  testingReview: {
    model: 'gpt-4o',
    systemPrompt: `You are a testing specialist. Review the code and tests for:
- Test coverage and quality
- Unit test structure and organization
- Integration test scenarios
- Mock and stub usage
- Test data management
- Edge case coverage
- Test maintainability

Provide specific test improvements with code examples.`,
    temperature: 0.2
  } as CodeReviewPrompt,

  documentationReview: {
    model: 'o1',
    systemPrompt: `You are a technical documentation specialist. Review the code documentation for:
- JSDoc/TSDoc completeness
- README quality and completeness
- API documentation clarity
- Code comment quality and necessity
- Example usage and tutorials
- Architecture documentation
- Changelog maintenance

Suggest documentation improvements with specific examples.`,
    temperature: 0.3
  } as CodeReviewPrompt
};

export interface CodeReviewResult {
  issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    description: string;
    suggestion: string;
    codeExample?: string;
  }>;
  summary: string;
}

export function selectModelForReview(
  fileExtension: string,
  fileSize: number,
  reviewType: keyof typeof CODE_REVIEW_PROMPTS
): CodeReviewPrompt {
  // Use GPT-4o for more complex analysis
  const needsGPT4 = 
    reviewType === 'securityAudit' ||
    reviewType === 'bugDetection' ||
    reviewType === 'testingReview' ||
    (fileSize > 1000 && (
      reviewType === 'performanceReview' ||
      reviewType === 'codeQuality'
    ));

  // Override the default model if needed
  const prompt = { ...CODE_REVIEW_PROMPTS[reviewType] };
  if (needsGPT4 && prompt.model !== 'gpt-4o') {
    prompt.model = 'gpt-4o';
  }

  // Adjust max tokens based on file size
  prompt.maxTokens = Math.min(4000, Math.max(1000, fileSize * 2));

  return prompt;
}

export function formatReviewRequest(
  code: string,
  prompt: CodeReviewPrompt,
  context?: {
    repository?: string;
    branch?: string;
    commitHash?: string;
    filePath?: string;
    pullRequest?: string;
  }
): string {
  let contextStr = '';
  if (context) {
    contextStr = `
Context:
${context.repository ? `Repository: ${context.repository}` : ''}
${context.branch ? `Branch: ${context.branch}` : ''}
${context.commitHash ? `Commit: ${context.commitHash}` : ''}
${context.filePath ? `File: ${context.filePath}` : ''}
${context.pullRequest ? `Pull Request: ${context.pullRequest}` : ''}
`;
  }

  return `${prompt.systemPrompt}

${contextStr}

Code to review:
\`\`\`
${code}
\`\`\`

Provide a detailed review following the system prompt guidelines. Format your response as a JSON object matching the CodeReviewResult interface with:
1. An array of issues, each containing severity, category, description, suggestion, and optional codeExample
2. A summary of the overall review

Be specific and actionable in your suggestions.`;
}
