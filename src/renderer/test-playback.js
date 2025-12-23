// test-playback.js
const axios = require('axios');

async function testPlayback() {
  try {
    console.log('Testing playback functionality');
    
    // First, get some movies to test with
    console.log('Fetching movies list...');
    const moviesResponse = await axios.get('http://124.222.196.128:6660/video/movies?page=1&page_size=3');
    console.log('Movies response status:', moviesResponse.status);
    
    if (moviesResponse.data?.data?.list?.length > 0) {
      const firstMovie = moviesResponse.data.data.list[0];
      console.log('First movie:', firstMovie);
      
      // Try to get episodes for this movie (if it's a movie, it might not have episodes)
      console.log('Trying to get episodes for movie:', firstMovie.id);
      try {
        const episodesResponse = await axios.get(`http://124.222.196.128:6660/video/episodes?videoid=${firstMovie.id}`);
        console.log('Episodes response:', episodesResponse.status);
        console.log('Episodes data:', episodesResponse.data);
        
        if (episodesResponse.data?.data?.list?.length > 0) {
          const firstEpisode = episodesResponse.data.data.list[0];
          console.log('First episode:', firstEpisode);
          
          // Try to get play URL for this episode
          console.log('Getting play URL for episode:', firstEpisode.id);
          const playResponse = await axios.get(`http://124.222.196.128:6660/video/play?type=movie&videoid=${firstMovie.id}&episodes=${firstEpisode.id}`);
          console.log('Play URL response:', playResponse.status);
          console.log('Play URL data:', playResponse.data);
        }
      } catch (episodesError) {
        console.log('Episodes not found for this video (might be a movie):', episodesError.message);
        
        // Try to get play URL directly for the movie
        console.log('Getting play URL for movie:', firstMovie.id);
        const playResponse = await axios.get(`http://124.222.196.128:6660/video/play?type=movie&videoid=${firstMovie.id}`);
        console.log('Play URL response:', playResponse.status);
        console.log('Play URL data:', playResponse.data);
      }
    }
    
    // Now try with TV shows
    console.log('\nFetching TV shows list...');
    const tvResponse = await axios.get('http://124.222.196.128:6660/video/tv?page=1&page_size=3');
    console.log('TV shows response status:', tvResponse.status);
    
    if (tvResponse.data?.data?.list?.length > 0) {
      const firstTVShow = tvResponse.data.data.list[0];
      console.log('First TV show:', firstTVShow);
      
      // Get episodes for this TV show
      console.log('Getting episodes for TV show:', firstTVShow.id);
      const episodesResponse = await axios.get(`http://124.222.196.128:6660/video/episodes?videoid=${firstTVShow.id}`);
      console.log('Episodes response:', episodesResponse.status);
      console.log('Episodes data:', episodesResponse.data);
      
      if (episodesResponse.data?.data?.list?.length > 0) {
        const firstEpisode = episodesResponse.data.data.list[0];
        console.log('First episode:', firstEpisode);
        
        // Get play URL for this episode
        console.log('Getting play URL for episode:', firstEpisode.id);
        const playResponse = await axios.get(`http://124.222.196.128:6660/video/play?type=tv&videoid=${firstTVShow.id}&episodes=${firstEpisode.id}`);
        console.log('Play URL response:', playResponse.status);
        console.log('Play URL data:', playResponse.data);
      }
    }
    
    console.log('\nPlayback test completed successfully!');
  } catch (error) {
    console.error('Playback test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testPlayback();