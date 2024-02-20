using CodeAnalyzer.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Scripting;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace CodeAnalyzer.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AnalyzeController : ControllerBase
    {
        [HttpPost]
        public async Task<IActionResult> AnalyzeCode([FromBody] CodeRequest request)
        {
            try
            {
                var result = await Analyze(request.Code);

                // Check naming conventions
                var namingConventionViolations = CheckNamingConventions(request.Code);

                return Ok(new { result,
                    NamingConventionViolations = namingConventionViolations.ToList()
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { Error = ex.Message });
            }
        }
        public async Task<object> Analyze(string code)
        {
            code = RemoveNamespaceDeclaration(code);

            var script = CSharpScript.Create(code, ScriptOptions.Default);

            try
            {
                //// Compile and execute the script
                //var result = await script.RunAsync();
                //return result.ReturnValue; // Return the script's output
                var result = await script.RunAsync();


                return new
                {
                    Result = result.ReturnValue
                };
            }
            catch(CompilationErrorException ex)
            {
                return new { Errors = ex.Diagnostics.Where(d => d.Id != "CS0234" && d.Id != "CS0246").Select(d => d.ToString()) };

            }
            catch (Exception ex)
            {
                // Handle other runtime errors
                return new
                {
                    Error = ex.Message
                };
            }
        }

        private string RemoveNamespaceDeclaration(string code)
        {
            // Find the starting index of the part to be removed
            int startIndex = code.IndexOf("namespace ");

            if (startIndex != -1)
            {
                int openingBraceIndex = code.IndexOf('{', startIndex);

                if (openingBraceIndex != -1)
                {
                    code = code.Remove(startIndex, openingBraceIndex - startIndex + 1);
                }
            }
            int lastClosingBraceIndex = code.LastIndexOf('}');

            if (lastClosingBraceIndex != -1)
            {
                code = code.Remove(lastClosingBraceIndex, 1);
            }
            return code;
        }
        private IEnumerable<string> CheckNamingConventions(string code)
        {
            // Implement your naming convention checks here
            // For example, checking class names to start with an uppercase letter
            var syntaxTree = CSharpSyntaxTree.ParseText(code);
            var root = syntaxTree.GetRoot();
            var classDeclarations = root.DescendantNodes().OfType<ClassDeclarationSyntax>();
            foreach (var classDeclaration in classDeclarations)
            {
                var className = classDeclaration.Identifier.Text;
                if (!char.IsUpper(className[0])) // Check if the first character is not uppercase
                {
                    yield return $"Class '{className}' does not follow naming convention. It should start with an uppercase letter.";
                }
            }

        }


    }
}
