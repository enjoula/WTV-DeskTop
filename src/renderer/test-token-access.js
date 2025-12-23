// test-token-access.js
const axios = require('axios');

async function testTokenAccess() {
  try {
    console.log('Testing access with registration token');
    
    // Use the token from registration to access protected endpoints
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoyNTg5MDA3MDM3ODU5NzE3MTIsInVzZXJuYW1lIjoidGVzdHVzZXJfMTc2NTc5MzkzNzY4MyIsImV4cCI6MTc5NzMyOTkzNywiaWF0IjoxNzY1NzkzOTM3LCJqdGkiOiJjZmI2MWNiNS0zODcyLTQzOTctYTM2YS0xZDRkZTMzMTUyZmMifQ.OsbsiMI-OL78bEmI-zJmJWyDj_j48CzY-gp2OHxgruQ';
    
    const config = {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
    
    // Test episodes endpoint with auth
    console.log('Testing episodes endpoint with registration token...');
    try {
      const episodesResponse = await axios.get('http://124.222.196.128:6660/video/episodes?videoid=258575338397958144', config);
      console.log('Episodes response with auth:', episodesResponse.status);
      console.log('Episodes data:', episodesResponse.data);
    } catch (episodesError) {
      console.log('Episodes access failed:', episodesError.message);
      if (episodesError.response) {
        console.log('Episodes response status:', episodesError.response.status);
        console.log('Episodes response data:', episodesError.response.data);
      }
    }
    
    // Test play URL endpoint with auth
    console.log('Testing play URL endpoint with registration token...');
    try {
      const playResponse = await axios.get('http://124.222.196.128:6660/video/play?type=tv&videoid=258575338397958144&episodes=1', config);
      console.log('Play URL response with auth:', playResponse.status);
      console.log('Play URL data:', playResponse.data);
    } catch (playError) {
      console.log('Play URL access failed:', playError.message);
      if (playError.response) {
        console.log('Play URL response status:', playError.response.status);
        console.log('Play URL response data:', playError.response.data);
      }
    }
    
    console.log('Token access test completed!');
  } catch (error) {
    console.error('Token access test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testTokenAccess();