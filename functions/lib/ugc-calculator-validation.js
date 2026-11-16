/* Server-side version-aware validation for declarative community calculators.
 * The shared engine remains the source of schema and formula semantics. This
 * adapter adds a runtime default-evaluation gate for V2 definitions.
 */
export function validateCalculatorForServer(engine,spec){
 const errors=[];
 if(!engine||typeof engine.resolveCalculatorVersions!=="function"||
    typeof engine.validateVersionedSpec!=="function"){
  return {valid:false,versions:null,errors:["The shared calculator engine is unavailable."],defaultEvaluation:null};
 }
 let versions;
 try{
  versions=engine.resolveCalculatorVersions(spec);
 }catch(error){
  return {valid:false,versions:null,errors:[String(error?.message||"Unsupported calculator version.")],defaultEvaluation:null};
 }
 let validation;
 try{
  validation=engine.validateVersionedSpec(spec);
 }catch(error){
  return {valid:false,versions,errors:[String(error?.message||"The calculator definition could not be validated.")],defaultEvaluation:null};
 }
 if(!Array.isArray(validation?.errors)){
  return {valid:false,versions,errors:["The calculator validator returned an invalid response."],defaultEvaluation:null};
 }
 errors.push(...validation.errors.map(error=>String(error)));
 if(errors.length)return {valid:false,versions,errors,defaultEvaluation:null};

 if(versions.schemaVersion===2){
  if(typeof engine.createDefaultTypedValues!=="function"||
     typeof engine.createDefaultTypedGroupValues!=="function"||
     typeof engine.evaluateV2TypedResults!=="function"){
   return {valid:false,versions,errors:["The V2 typed calculator runtime is incomplete."],defaultEvaluation:null};
  }
  const inputDefaults=engine.createDefaultTypedValues(spec);
  const groupDefaults=engine.createDefaultTypedGroupValues(spec);
  if(inputDefaults?.valid!==true)errors.push(...(Array.isArray(inputDefaults?.errors)?inputDefaults.errors:["V2 input defaults could not be normalized."]));
  if(groupDefaults?.valid!==true)errors.push(...(Array.isArray(groupDefaults?.errors)?groupDefaults.errors:["V2 dynamic-group defaults could not be normalized."]));
  if(errors.length)return {valid:false,versions,errors,defaultEvaluation:null};
  try{
   const defaultEvaluation=engine.evaluateV2TypedResults(spec,inputDefaults.values,groupDefaults.groups);
   return {valid:true,versions,errors:[],defaultEvaluation};
  }catch(error){
   return {valid:false,versions,errors:[String(error?.message||"The V2 calculator failed its default-value evaluation.")],defaultEvaluation:null};
  }
 }
 return {valid:true,versions,errors:[],defaultEvaluation:null};
}
