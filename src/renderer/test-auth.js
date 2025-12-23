// test-auth.js
const axios = require('axios');

async function testAuth() {
  try {
    console.log('Testing authentication and protected endpoints');
    
    // Try to register a test user
    console.log('Attempting to register a test user...');
    const registerResponse = await axios.post('http://124.222.196.128:6660/user/register', {
      username: 'testuser_' + Date.now(),
      password: 'testpassword123',
      email: 'testuser_' + Date.now() + '@example.com'
    });
    
    console.log('Registration response:', registerResponse.status);
    console.log('Registration data:', registerResponse.data);
    
    // Try to login
    console.log('Attempting to login...');
    const loginResponse = await axios.post('http://124.222.196.128:6660/user/login', {
      username: 'testuser_' + Date.now(),
      password: 'testpassword123'
    });
    
    console.log('Login response:', loginResponse.status);
    console.log('Login data:', loginResponse.data);
    
    // Extract token if available
    const token = loginResponse.data?.data?.token;
    if (token) {
      console.log('Token obtained successfully');
      
      // Use token to access protected endpoints
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };
      
      // Test episodes endpoint with auth
      console.log('Testing episodes endpoint with authentication...');
      const episodesResponse = await axios.get('http://124.222.196.128:6660/video/episodes?videoid=258575338397958144', config);
      console.log('Episodes response with auth:', episodesResponse.status);
      console.log('Episodes data:', episodesResponse.data);
    } else {
      console.log('No token received, testing without auth...');
      
      // Test public endpoints
      const moviesResponse = await axios.get('http://124.222.196.128:6660/video/movies?page=1&page_size=3');
      console.log('Movies response:', moviesResponse.status);
      console.log('Movies count:', moviesResponse.data?.data?.list?.length || 0);
    }
    
    console.log('Authentication test completed!');
  } catch (error) {
    console.error('Authentication test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testAuth();