// test-api.js
const axios = require('axios');

async function testAPI() {
  try {
    console.log('Testing API connection to http://124.222.196.128:6660');
    
    // Test ping endpoint
    const pingResponse = await axios.get('http://124.222.196.128:6660/ping');
    console.log('Ping response:', pingResponse.data);
    
    // Test movies endpoint
    const moviesResponse = await axios.get('http://124.222.196.128:6660/video/movies?page=1&page_size=5');
    console.log('Movies response status:', moviesResponse.status);
    console.log('Movies count:', moviesResponse.data?.data?.list?.length || 0);
    
    // Test TV shows endpoint
    const tvResponse = await axios.get('http://124.222.196.128:6660/video/tv?page=1&page_size=5');
    console.log('TV shows response status:', tvResponse.status);
    console.log('TV shows count:', tvResponse.data?.data?.list?.length || 0);
    
    console.log('API test completed successfully!');
  } catch (error) {
    console.error('API test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testAPI();