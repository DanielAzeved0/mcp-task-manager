// Test script for the improved AI pipeline
const testRequest = {
  prompt: "Create a function to validate email addresses",
  preferred_backend: "auto",
  strict_json: true,
  user_id: "test_user"
};

fetch('http://localhost:3000/prompt-to-spec', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(testRequest)
})
.then(response => response.json())
.then(data => {
  console.log('Response received:');
  console.log('Status:', data.status);
  console.log('Fallback used:', data.fallback.used_fallback);
  console.log('Fallback quality:', data.fallback.fallback_quality);
  console.log('JSON validation attempts:', data.json_validation.attempts);
  console.log('JSON auto-fixed:', data.json_validation.auto_fixed);
  console.log('Prompt spec task:', data.prompt_spec?.task_instruction?.substring(0, 100) + '...');
})
.catch(error => {
  console.error('Error:', error);
});