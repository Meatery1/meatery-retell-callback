    // Try different date ranges to find your checkout
    const dateQueries = [
      'created_at:>2024-08-20',  // August 20th onwards
      'created_at:>2024-08-25',  // August 25th onwards
      'created_at:>2024-08-22',  // August 22nd onwards
      'created_at:08-25',         // August 25th specifically
      'created_at:08-26',         // August 26th specifically
      'created_at:08-27',         // August 27th specifically
      'created_at:08-24',         // August 24th specifically
      'created_at:08-23'          // August 23rd specifically
    ];
