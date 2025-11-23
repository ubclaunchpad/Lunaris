// Test file to trigger ESLint and Prettier errors

export function badFunction( ) {
    const unused_variable = "this will cause eslint error";
  const bad_spacing="no spaces around equals";
    
    
    // Too many blank lines above
    
    if(true){console.log("bad formatting")}
    
    var oldVar = "should use let/const";
    
    return   "extra   spaces"
}
