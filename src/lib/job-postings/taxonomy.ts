/**
 * Skills recognised without AI, with the other names they go by and a family of
 * related skills. Matching an alias counts as the skill itself ("Postgres" is
 * PostgreSQL); a skill from the same family counts as partly met ("React" for "Vue").
 *
 * Words that are also plain English (Go, REST, CAN, Excel, Swift…) are only matched in
 * unambiguous forms ("Golang", "REST API", "CAN bus", "Microsoft Excel").
 */

export type Skill = { name: string; aliases: readonly string[]; family: string };

const S = (family: string, name: string, ...aliases: string[]): Skill => ({ name, aliases, family });

export const SKILLS: readonly Skill[] = [
  // languages
  S("lang-js", "JavaScript", "JS", "ECMAScript", "ES6"),
  S("lang-js", "TypeScript"),
  S("lang-jvm", "Java"),
  S("lang-jvm", "Kotlin"),
  S("lang-jvm", "Scala"),
  S("lang-dotnet", "C#", "C Sharp", "CSharp"),
  S("lang-systems", "C++", "CPP", "C/C++"),
  S("lang-systems", "C programming", "C language", "C/C++", "ANSI C", "C99"),
  S("lang-systems", "Rust"),
  S("lang-systems", "Golang", "Go language", "Go (Golang)"),
  S("lang-script", "Python", "Python3", "Python 3"),
  S("lang-script", "Ruby"),
  S("lang-script", "PHP"),
  S("lang-script", "Perl"),
  S("lang-script", "Bash", "shell scripting"),
  S("lang-script", "PowerShell"),
  S("lang-script", "Lua"),
  S("lang-mobile", "SwiftUI", "Swift programming", "Swift language"),
  S("lang-mobile", "Objective-C"),
  S("lang-mobile", "Dart"),
  S("lang-numeric", "MATLAB"),
  S("lang-numeric", "Simulink"),
  S("lang-numeric", "LabVIEW"),
  S("lang-hdl", "VHDL"),
  S("lang-hdl", "Verilog"),
  S("lang-hdl", "SystemVerilog"),
  S("lang-sql", "SQL", "T-SQL", "PL/SQL"),
  S("lang-func", "Haskell"),
  S("lang-func", "Elixir"),
  // web
  S("frontend", "React", "React.js", "ReactJS"),
  S("frontend", "Angular", "AngularJS"),
  S("frontend", "Vue", "Vue.js", "VueJS"),
  S("frontend", "Svelte"),
  S("frontend", "Next.js", "NextJS"),
  S("frontend", "HTML", "HTML5"),
  S("frontend", "CSS", "CSS3", "Sass", "SCSS"),
  S("frontend", "Tailwind", "Tailwind CSS"),
  S("backend-js", "Node.js", "NodeJS"),
  S("backend-js", "Express.js", "ExpressJS"),
  S("backend-py", "Django"),
  S("backend-py", "Flask"),
  S("backend-py", "FastAPI"),
  S("backend-jvm", "Spring Boot", "Spring Framework"),
  S("backend-dotnet", ".NET", "dotnet", ".NET Core", "ASP.NET"),
  S("backend-rb", "Ruby on Rails", "RoR"),
  S("backend-php", "Laravel"),
  S("api", "REST API", "REST APIs", "RESTful", "RESTful APIs", "REST services"),
  S("api", "GraphQL"),
  S("api", "gRPC"),
  S("mobile", "React Native"),
  S("mobile", "Flutter"),
  S("mobile", "Android"),
  S("mobile", "iOS"),
  // data
  S("sql-db", "PostgreSQL", "Postgres", "Postgre SQL"),
  S("sql-db", "MySQL", "MariaDB"),
  S("sql-db", "SQL Server", "MSSQL", "Microsoft SQL Server"),
  S("sql-db", "Oracle Database", "Oracle DB"),
  S("sql-db", "SQLite"),
  S("nosql-db", "MongoDB", "Mongo"),
  S("nosql-db", "Redis"),
  S("nosql-db", "Cassandra"),
  S("nosql-db", "DynamoDB"),
  S("nosql-db", "Elasticsearch", "OpenSearch"),
  S("warehouse", "Snowflake"),
  S("warehouse", "BigQuery"),
  S("warehouse", "Databricks"),
  S("warehouse", "Redshift"),
  S("data-eng", "Apache Spark", "PySpark", "Spark SQL"),
  S("data-eng", "Hadoop"),
  S("data-eng", "Kafka", "Apache Kafka"),
  S("data-eng", "Airflow", "Apache Airflow"),
  S("data-eng", "dbt"),
  S("data-eng", "ETL", "ELT", "data pipelines"),
  S("data-py", "Pandas"),
  S("data-py", "NumPy"),
  S("ml", "scikit-learn", "sklearn"),
  S("ml", "TensorFlow"),
  S("ml", "PyTorch"),
  S("ml", "Keras"),
  S("ml", "Machine Learning", "ML"),
  S("ml", "Deep Learning"),
  S("ml", "NLP", "Natural Language Processing"),
  S("ml", "LLM", "LLMs", "Large Language Models"),
  S("ml", "Computer Vision", "OpenCV"),
  S("bi", "Power BI", "PowerBI"),
  S("bi", "Tableau"),
  S("bi", "Looker"),
  S("bi", "Microsoft Excel", "MS Excel", "Excel (advanced)"),
  // cloud and ops
  S("cloud", "AWS", "Amazon Web Services"),
  S("cloud", "Azure", "Microsoft Azure"),
  S("cloud", "GCP", "Google Cloud", "Google Cloud Platform"),
  S("containers", "Docker", "containerization"),
  S("containers", "Kubernetes", "k8s", "EKS", "GKE", "AKS"),
  S("iac", "Terraform"),
  S("iac", "Ansible"),
  S("iac", "CloudFormation"),
  S("cicd", "CI/CD", "continuous integration", "continuous delivery"),
  S("cicd", "Jenkins"),
  S("cicd", "GitHub Actions"),
  S("cicd", "GitLab CI", "GitLab CI/CD"),
  S("cicd", "CircleCI"),
  S("vcs", "Git", "GitHub", "GitLab", "Bitbucket"),
  S("os", "Linux", "Ubuntu", "RHEL"),
  S("os", "Unix"),
  S("os", "Windows Server"),
  S("observability", "Prometheus"),
  S("observability", "Grafana"),
  S("observability", "Datadog"),
  S("observability", "Splunk"),
  S("arch", "Microservices"),
  S("arch", "Serverless", "AWS Lambda"),
  S("arch", "Distributed Systems"),
  S("arch", "System Design"),
  S("web-server", "Nginx"),
  // embedded, electrical, mechatronics
  S("embedded", "Embedded C", "embedded C/C++"),
  S("embedded", "Embedded Linux"),
  S("embedded", "Firmware"),
  S("embedded", "Microcontrollers", "microcontroller", "MCU", "MCUs"),
  S("embedded", "STM32"),
  S("embedded", "Arduino"),
  S("embedded", "Raspberry Pi"),
  S("rtos", "RTOS", "real-time operating system"),
  S("rtos", "FreeRTOS"),
  S("rtos", "Zephyr"),
  S("rtos", "Yocto"),
  S("hdl", "FPGA"),
  S("hdl", "ASIC"),
  S("pcb", "PCB design", "PCB", "printed circuit board"),
  S("pcb", "Altium", "Altium Designer"),
  S("pcb", "KiCad"),
  S("pcb", "OrCAD"),
  S("circuit-sim", "SPICE", "LTspice", "PSpice"),
  S("lab", "Oscilloscope", "oscilloscopes", "logic analyzer", "multimeter"),
  S("protocol", "I2C", "I²C"),
  S("protocol", "SPI"),
  S("protocol", "UART", "RS-232", "RS-485"),
  S("protocol", "CAN bus", "CANbus", "CAN protocol"),
  S("protocol", "Modbus"),
  S("protocol", "Ethernet"),
  S("protocol", "TCP/IP"),
  S("automation", "PLC", "PLCs", "programmable logic controllers"),
  S("automation", "SCADA"),
  S("automation", "HMI"),
  S("automation", "Ladder Logic"),
  S("robotics", "ROS", "Robot Operating System"),
  S("robotics", "ROS2", "ROS 2"),
  S("robotics", "Robotics"),
  S("controls", "Control Systems", "control theory"),
  S("controls", "PID", "PID control"),
  S("power", "Power Electronics"),
  S("signal", "Signal Processing", "DSP"),
  S("cad", "SolidWorks"),
  S("cad", "AutoCAD"),
  S("cad", "CATIA"),
  S("cad", "Fusion 360"),
  S("cad", "Autodesk Inventor"),
  S("cad", "Revit"),
  S("sim", "ANSYS"),
  S("sim", "COMSOL"),
  // IT and security
  S("security", "Cybersecurity", "information security", "InfoSec"),
  S("security", "Penetration Testing", "pen testing"),
  S("security", "SIEM"),
  S("it", "Active Directory"),
  S("it", "VMware"),
  S("it", "Help desk", "service desk", "technical support"),
  S("networking", "Network administration", "Cisco", "CCNA"),
  // practice
  S("process", "Agile"),
  S("process", "Scrum"),
  S("process", "Jira"),
  S("testing", "Unit Testing", "unit tests"),
  S("testing", "Test Automation", "automated testing"),
  S("testing", "Selenium"),
  S("testing", "Cypress"),
  S("testing", "Playwright"),
  S("testing", "Jest"),
  S("testing", "pytest"),
  S("testing", "JUnit"),
  S("testing", "QA", "quality assurance"),
  S("cs", "Object-Oriented Programming", "OOP", "object-oriented"),
  S("cs", "Data Structures"),
  S("cs", "Algorithms"),
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Whole-term match that treats symbols as part of a term: "C" doesn't match "C++" or "C#". */
function termRegex(term: string): RegExp {
  // Very short names are matched case-sensitively, so "ML" isn't found in "html" and "C" isn't any "c".
  const flags = term.length <= 2 ? "" : "i";
  return new RegExp(`(?<![A-Za-z0-9+#./])${escape(term)}(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])`, flags);
}

const COMPILED = SKILLS.map((s) => ({ skill: s, res: [s.name, ...s.aliases].map(termRegex) }));
const BY_NAME = new Map(SKILLS.map((s) => [s.name, s]));

/** Canonical skills named in a text, in the order of the taxonomy. */
export function skillsIn(text: string): Skill[] {
  const t = text.replace(/\s+/g, " ");
  return COMPILED.filter(({ res }) => res.some((re) => re.test(t))).map(({ skill }) => skill);
}

export const skillByName = (name: string) => BY_NAME.get(name) ?? null;

/** The words a text uses for a skill: "Postgres" in "Wrote Postgres migrations". */
export function wordingIn(text: string, skill: Skill): string | null {
  for (const term of [skill.name, ...skill.aliases]) {
    const m = text.match(termRegex(term));
    if (m) return m[0];
  }
  return null;
}
